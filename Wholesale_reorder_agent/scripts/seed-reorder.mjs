// Seed ro_suppliers, ro_supplier_items, and 90 days of ro_sales_daily.
// Idempotent: re-running upserts suppliers and skips already-seeded sales.
// Requires network access to Shopify (fetches variants via client_credentials).
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STORE_DOMAIN || !CLIENT_ID || !CLIENT_SECRET || !API_VERSION) {
  console.error('Missing Shopify env vars');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NORTHWIND_PRODUCTS = [
  'Field Jacket', 'Trail Blazer', 'Base Layer Tee', 'Merino Sweater',
  'Chino Pants', 'Canvas Shorts', 'Wool Beanie', 'Leather Belt',
  'Crew Socks (3-Pack)', 'Rain Shell', 'Down Vest', 'Flannel Shirt',
];

// Supplier definitions from SPEC.md
const SUPPLIERS = [
  {
    name: 'Fern & Pine Textiles',
    email: 'orders@fern-and-pine.example.com',
    address: '120 Loomis Ave, Portland, OR 97201 (sample)',
    lead_time_days: 14,
    moq: 20,
    case_pack: 5,
    products: ['Field Jacket', 'Trail Blazer', 'Rain Shell', 'Base Layer Tee', 'Chino Pants', 'Canvas Shorts', 'Flannel Shirt', 'Down Vest'],
  },
  {
    name: 'Coastline Knit Co.',
    email: 'orders@coastline-knit.example.com',
    address: '88 Harbor St, Brooklyn, NY 11201 (sample)',
    lead_time_days: 10,
    moq: 24,
    case_pack: 6,
    products: ['Merino Sweater', 'Crew Socks (3-Pack)', 'Wool Beanie'],
  },
  {
    name: 'Ridgeway Leather',
    email: 'orders@ridgeway-leather.example.com',
    address: '5 Tannery Rd, Leonia, NJ 07605 (sample)',
    lead_time_days: 21,
    moq: 10,
    case_pack: 2,
    products: ['Leather Belt'],
  },
];

async function getAccessToken() {
  const url = `https://${STORE_DOMAIN}/admin/oauth/access_token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Shopify token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function shopifyGraphQL(query, variables) {
  const token = await getAccessToken();
  const url = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json();
      if (json.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
      return json.data;
    } catch (e) {
      lastErr = e;
      if (attempt < 5) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function getProducts() {
  const data = await shopifyGraphQL(`
    query getProducts {
      products(first: 50) {
        edges {
          node {
            id
            title
            variants(first: 20) {
              edges {
                node {
                  id
                  title
                  price
                  inventoryQuantity
                  selectedOptions { name value }
                }
              }
            }
          }
        }
      }
    }
  `);
  return data.products.edges.map(e => e.node);
}

// Deterministic pseudo-random based on a string seed
function seededRand(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function genSales(variantId, productTitle, size, days = 90) {
  const rand = seededRand(variantId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sales = [];
  // Base daily rate depends on product
  let baseRate = 1.2;
  if (productTitle.includes('Field Jacket')) baseRate = 2.1;
  if (productTitle.includes('Base Layer Tee')) baseRate = 2.3;
  if (productTitle.includes('Socks') || productTitle.includes('Beanie')) baseRate = 0.8;
  if (productTitle.includes('Belt')) baseRate = 0.4;

  for (let i = days; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dow = d.getDay(); // 0 Sun … 6 Sat
    // Weekly pattern: weekends slower
    const weekFactor = dow === 0 || dow === 6 ? 0.6 : 1.0;
    let qty = Math.max(0, Math.round(baseRate * weekFactor * (0.7 + rand() * 0.8)));
    // Recent uptick on Field Jacket and Base Layer Tee (last 14 days)
    if (
      (productTitle.includes('Field Jacket') || productTitle.includes('Base Layer Tee')) &&
      i <= 14
    ) {
      qty = Math.round(qty * 1.6 + 1);
    }
    if (qty > 0) sales.push({ shopify_variant_id: variantId, date: dateStr(d), quantity: qty });
  }
  return sales;
}

async function main() {
  console.log('Fetching products from Shopify…');
  const allProducts = await getProducts();
  const products = allProducts.filter(p => NORTHWIND_PRODUCTS.includes(p.title));
  console.log(`Found ${products.length} Northwind products`);

  // 1. Upsert suppliers
  for (const s of SUPPLIERS) {
    const { error } = await supabase
      .from('ro_suppliers')
      .upsert(
        {
          name: s.name,
          email: s.email,
          address: s.address,
          lead_time_days: s.lead_time_days,
          moq: s.moq,
          case_pack: s.case_pack,
        },
        { onConflict: 'name' },
      )
      .select()
      .single();
    if (error) throw error;
  }
  const { data: supplierRows } = await supabase.from('ro_suppliers').select('*');
  const supplierByName = new Map((supplierRows ?? []).map(s => [s.name, s]));
  console.log(`Seeded ${supplierByName.size} suppliers`);

  // 2. Upsert supplier items (variant → supplier, unit cost ≈ 45% of retail)
  let itemCount = 0;
  for (const product of products) {
    const supplierDef = SUPPLIERS.find(s => s.products.includes(product.title));
    if (!supplierDef) {
      console.warn(`No supplier mapped for "${product.title}", skipping`);
      continue;
    }
    const supplier = supplierByName.get(supplierDef.name);
    const variants = product.variants?.edges?.map(e => e.node) ?? [];
    for (const v of variants) {
      const size = v.selectedOptions?.find(o => o.name === 'Size')?.value ?? v.title;
      const unitCost = Math.round(Number(v.price) * 0.45 * 100) / 100;
      const supplierSku = `${supplierDef.name.split(' ')[0].toUpperCase()}-${product.title.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)}-${size}`;
      const { error } = await supabase
        .from('ro_supplier_items')
        .upsert(
          {
            supplier_id: supplier.id,
            shopify_product_id: product.id,
            shopify_variant_id: v.id,
            product_title: product.title,
            supplier_sku: supplierSku,
            unit_cost: unitCost,
          },
          { onConflict: 'shopify_variant_id' },
        );
      if (error) throw error;
      itemCount++;
    }
  }
  console.log(`Seeded ${itemCount} supplier items`);

  // 3. Seed 90 days of sales (per-variant idempotency: only insert for variants with no sales yet)
  // Fetch all distinct variant IDs that already have sales (paginate to avoid the 1000-row default limit)
  const seededVariants = new Set();
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data: page } = await supabase
      .from('ro_sales_daily')
      .select('shopify_variant_id')
      .range(from, from + PAGE - 1);
    if (!page || page.length === 0) break;
    for (const r of page) seededVariants.add(r.shopify_variant_id);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const allSales = [];
  for (const product of products) {
    const variants = product.variants?.edges?.map(e => e.node) ?? [];
    for (const v of variants) {
      if (seededVariants.has(v.id)) continue;
      const size = v.selectedOptions?.find(o => o.name === 'Size')?.value ?? v.title;
      const sales = genSales(v.id, product.title, size, 90);
      allSales.push(...sales);
    }
  }

  if (allSales.length === 0) {
    console.log('Sales already seeded for all variants, skipping (idempotent)');
  } else {
    let salesCount = 0;
    for (let i = 0; i < allSales.length; i += 500) {
      const batch = allSales.slice(i, i + 500);
      const { error } = await supabase.from('ro_sales_daily').insert(batch);
      if (error) throw error;
      salesCount += batch.length;
    }
    console.log(`Seeded ${salesCount} daily sales rows (new variants only)`);
  }

  console.log('Done. Sample data only — no real orders or emails.');
}

main().catch(e => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});

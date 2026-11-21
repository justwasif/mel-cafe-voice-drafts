import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

async function getToken() {
  if (SHOPIFY_ADMIN_ACCESS_TOKEN) return SHOPIFY_ADMIN_ACCESS_TOKEN;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SHOPIFY_CLIENT_ID,
    client_secret: SHOPIFY_CLIENT_SECRET,
  });
  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(JSON.stringify(data));
  return data.access_token;
}

// Unsplash royalty-free outdoor apparel images (direct CDN URLs)
const PRODUCT_IMAGES = {
  'Field Jacket':       'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=600&q=80',
  'Trail Blazer':       'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&q=80',
  'Base Layer Tee':     'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80',
  'Merino Sweater':     'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&q=80',
  'Chino Pants':        'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&q=80',
  'Canvas Shorts':      'https://images.unsplash.com/photo-1543076447-215ad9ba6923?w=600&q=80',
  'Wool Beanie':        'https://images.unsplash.com/photo-1510598969022-c4c6c5d05769?w=600&q=80',
  'Leather Belt':       'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=600&q=80',
  'Crew Socks (3-Pack)':'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&q=80',
  'Rain Shell':         'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=600&q=80',
  'Down Vest':          'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=600&q=80',
  'Flannel Shirt':      'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&q=80',
};

async function run() {
  const token = await getToken();
  const base = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

  // Get all products
  const productsRes = await fetch(`${base}/products.json?limit=50`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  const { products } = await productsRes.json();

  for (const product of products) {
    const imageUrl = PRODUCT_IMAGES[product.title];
    if (!imageUrl) continue;
    if (product.image) {
      console.log(`Skip (has image): ${product.title}`);
      continue;
    }

    // Attach image via REST API
    const res = await fetch(`${base}/products/${product.id}.json`, {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product: {
          id: product.id,
          images: [{ src: imageUrl }],
        },
      }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✓ Image added: ${product.title}`);
    } else {
      console.error(`✗ Failed: ${product.title} — ${JSON.stringify(data.errors || data)}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('Done.');
}

run().catch(e => { console.error(e); process.exit(1); });

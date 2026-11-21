import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_API_VERSION) {
  console.error('Missing Shopify config');
  process.exit(1);
}

// Fresh token every run — never reuse a cached token from before app reinstall
async function getToken() {
  if (SHOPIFY_ADMIN_ACCESS_TOKEN) return SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) throw new Error('No Shopify credentials');
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SHOPIFY_CLIENT_ID,
    client_secret: SHOPIFY_CLIENT_SECRET,
  });
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) throw new Error(JSON.stringify(data));
      return data.access_token;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function gql(query, variables = {}) {
  const token = await getToken();
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
      });
      const json = await res.json();
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      return json.data;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function sizeChart() {
  return JSON.stringify({
    XS: { chest: { cm: 86, in: 34 }, waist: { cm: 71, in: 28 } },
    S:  { chest: { cm: 91, in: 36 }, waist: { cm: 76, in: 30 } },
    M:  { chest: { cm: 96, in: 38 }, waist: { cm: 81, in: 32 } },
    L:  { chest: { cm: 102, in: 40 }, waist: { cm: 86, in: 34 } },
    XL: { chest: { cm: 107, in: 42 }, waist: { cm: 91, in: 36 } },
  });
}

const desiredProducts = [
  { title: 'Field Jacket', price: '129.00', stock: [5,8,12,6,0] },
  { title: 'Trail Blazer', price: '149.00', stock: [3,6,9,4,2] },
  { title: 'Base Layer Tee', price: '34.00', stock: [10,15,20,12,8] },
  { title: 'Merino Sweater', price: '89.00', stock: [4,7,11,5,3] },
  { title: 'Chino Pants', price: '69.00', stock: [6,0,14,8,5] },
  { title: 'Canvas Shorts', price: '49.00', stock: [8,12,0,7,4] },
  { title: 'Wool Beanie', price: '24.00', stock: [15,20,25,18,10] },
  { title: 'Leather Belt', price: '44.00', stock: [5,8,12,6,4] },
  { title: 'Crew Socks (3-Pack)', price: '19.00', stock: [20,25,30,22,15] },
  { title: 'Rain Shell', price: '179.00', stock: [2,4,6,3,1] },
  { title: 'Down Vest', price: '119.00', stock: [3,5,8,4,2] },
  { title: 'Flannel Shirt', price: '59.00', stock: [7,11,15,9,6] },
];

const sizes = ['XS','S','M','L','XL'];

const customersList = [
  { email: 'alice@example.com', firstName: 'Alice', lastName: 'Anderson' },
  { email: 'bob@example.com', firstName: 'Bob', lastName: 'Baker' },
  { email: 'carol@example.com', firstName: 'Carol', lastName: 'Clark' },
  { email: 'dave@example.com', firstName: 'Dave', lastName: 'Davis' },
  { email: 'eve@example.com', firstName: 'Eve', lastName: 'Evans' },
  { email: 'frank@example.com', firstName: 'Frank', lastName: 'Ford' },
  { email: 'grace@example.com', firstName: 'Grace', lastName: 'Green' },
  { email: 'henry@example.com', firstName: 'Henry', lastName: 'Hill' },
];

// Desired 10 test orders: customer email, product title, size index, qty, state
const desiredOrders = [
  { email: 'alice@example.com',  product: 'Field Jacket',      sizeIdx: 1, qty: 1, state: 'unfulfilled' },
  { email: 'bob@example.com',    product: 'Trail Blazer',      sizeIdx: 2, qty: 1, state: 'fulfilled' },
  { email: 'carol@example.com',  product: 'Base Layer Tee',    sizeIdx: 0, qty: 2, state: 'partial', extra: { product: 'Merino Sweater', sizeIdx: 1, qty: 1 } },
  { email: 'dave@example.com',   product: 'Chino Pants',       sizeIdx: 2, qty: 1, state: 'refunded' },
  { email: 'eve@example.com',    product: 'Canvas Shorts',     sizeIdx: 3, qty: 1, state: 'unfulfilled' },
  { email: 'frank@example.com',  product: 'Wool Beanie',       sizeIdx: 0, qty: 2, state: 'fulfilled' },
  { email: 'grace@example.com',  product: 'Leather Belt',      sizeIdx: 1, qty: 1, state: 'unfulfilled' },
  { email: 'henry@example.com',  product: 'Crew Socks (3-Pack)', sizeIdx: 2, qty: 3, state: 'fulfilled' },
  { email: 'alice@example.com',  product: 'Rain Shell',        sizeIdx: 1, qty: 1, state: 'unfulfilled' },
  { email: 'bob@example.com',    product: 'Down Vest',         sizeIdx: 3, qty: 1, state: 'unfulfilled' },
];

async function seed() {
  // --- Products ---
  const existingProductData = await gql(`
    query getProducts {
      products(first: 50) {
        edges {
          node {
            id title
            variants(first: 20) { edges { node { id title price inventoryQuantity } } }
            metafields(first: 10) { edges { node { namespace key value } } }
          }
        }
      }
    }
  `);
  const existingProducts = existingProductData.products.edges.map(e => e.node);

  const productByTitle = {};
  for (const p of desiredProducts) {
    let existing = existingProducts.find(ep => ep.title === p.title);
    if (!existing) {
      const locations = await gql(`query { locations(first:1) { edges { node { id } } } }`);
      const locationId = locations.locations.edges[0].node.id;
      const variants = p.stock.map((qty, i) => ({
        optionValues: [{ name: sizes[i], optionName: 'Size' }],
        price: p.price,
        inventoryQuantities: [{ name: 'available', quantity: qty, locationId }],
      }));
      const res = await gql(`
        mutation productSet($input: ProductSetInput!) {
          productSet(input: $input) {
            product { id title }
            userErrors { field message }
          }
        }
      `, {
        input: {
          title: p.title,
          descriptionHtml: `<p>${p.title} — Northwind Supply Co.</p>`,
          productOptions: [{ name: 'Size', values: sizes.map(v => ({ name: v })) }],
          variants,
          metafields: [{ namespace: 'custom', key: 'size_chart', value: sizeChart(), type: 'json' }],
        },
      });
      if (res.productSet.userErrors?.length) throw new Error(JSON.stringify(res.productSet.userErrors));
      // Re-fetch with variants
      const fresh = await gql(`
        query getProduct($id: ID!) {
          product(id: $id) {
            id title
            variants(first: 20) { edges { node { id title price inventoryQuantity } } }
            metafields(first: 10) { edges { node { namespace key value } } }
          }
        }
      `, { id: res.productSet.product.id });
      existing = fresh.product;
      console.log('Created product:', p.title);
    }
    // Ensure size chart metafield
    const hasChart = existing.metafields?.edges?.some(e => e.node.namespace === 'custom' && e.node.key === 'size_chart');
    if (!hasChart) {
      await gql(`
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } }
        }
      `, {
        metafields: [{ ownerId: existing.id, namespace: 'custom', key: 'size_chart', value: sizeChart(), type: 'json' }],
      });
      console.log('Added size chart to:', p.title);
    }
    productByTitle[p.title] = existing;
  }
  console.log(`Products ready: ${Object.keys(productByTitle).length}`);

  // --- Customers ---
  const customerByEmail = {};
  for (const c of customersList) {
    try {
      const res = await gql(`
        mutation customerCreate($input: CustomerInput!) {
          customerCreate(input: $input) { customer { id email } userErrors { field message } }
        }
      `, { input: c });
      if (res.customerCreate.userErrors?.length) {
        // Already exists — look up by email via search
        const found = await gql(`
          query($query: String!) {
            customers(first: 1, query: $query) { edges { node { id email } } }
          }
        `, { query: `email:${c.email}` });
        const cust = found.customers.edges[0]?.node;
        if (cust) {
          customerByEmail[c.email] = cust;
          console.log('Using existing customer:', c.email);
        } else {
          customerByEmail[c.email] = { id: null, email: c.email };
        }
      } else {
        customerByEmail[c.email] = res.customerCreate.customer;
        console.log('Created customer:', c.email);
      }
    } catch (e) {
      customerByEmail[c.email] = { id: null, email: c.email };
      console.log('Customer fallback (email-only):', c.email);
    }
  }

  // --- Fetch all existing test orders ---
  const existingOrdersData = await gql(`
    query getOrders {
      orders(first: 50, query: "note:'Test order for Store Concierge'") {
        edges {
          node {
            id name
            customer { email }
            lineItems(first: 50) {
              edges { node { id title quantity variant { id } } }
            }
            fulfillments(first: 10) { id trackingInfo { number } }
            refunds(first: 10) { id }
            displayFulfillmentStatus
          }
        }
      }
    }
  `);
  const existingOrders = existingOrdersData.orders.edges.map(e => e.node);
  console.log(`Existing test orders: ${existingOrders.length}`);

  // Match existing orders to desired orders by (customer email, product title)
  function matchOrder(desired) {
    return existingOrders.find(o => {
      const email = o.customer?.email?.toLowerCase();
      if (email !== desired.email) return false;
      return o.lineItems.edges.some(e => e.node.title === desired.product);
    });
  }

  // --- Create missing orders ---
  async function createOrder(desired) {
    const customer = customerByEmail[desired.email];
    const product = productByTitle[desired.product];
    const variantId = product.variants.edges[desired.sizeIdx].node.id;
    const lineItems = [{ variantId, quantity: desired.qty, productTitle: desired.product }];
    if (desired.extra) {
      const extraProduct = productByTitle[desired.extra.product];
      const extraVariantId = extraProduct.variants.edges[desired.extra.sizeIdx].node.id;
      lineItems.push({ variantId: extraVariantId, quantity: desired.extra.qty, productTitle: desired.extra.product });
    }
    const draftInput = {
      lineItems: lineItems.map(li => ({ variantId: li.variantId, quantity: li.quantity })),
      note: 'Test order for Store Concierge',
    };
    if (customer.id) draftInput.customerId = customer.id;
    else draftInput.email = customer.email;
    const draft = await gql(`
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) { draftOrder { id } userErrors { field message } }
      }
    `, { input: draftInput });
    if (draft.draftOrderCreate.userErrors?.length) throw new Error(JSON.stringify(draft.draftOrderCreate.userErrors));
    const completed = await gql(`
      mutation draftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id) { draftOrder { id order { id name } } userErrors { field message } }
      }
    `, { id: draft.draftOrderCreate.draftOrder.id });
    if (completed.draftOrderComplete.userErrors?.length) throw new Error(JSON.stringify(completed.draftOrderComplete.userErrors));
    const orderId = completed.draftOrderComplete.draftOrder.order.id;
    await gql(`
      mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) { order { id } userErrors { field message } }
      }
    `, { input: { id: orderId } });
    // Fetch full order data
    const fullOrder = await gql(`
      query getOrder($id: ID!) {
        order(id: $id) {
          id name
          customer { email }
          lineItems(first: 50) { edges { node { id title quantity variant { id } } } }
          fulfillments(first: 10) { id trackingInfo { number } }
          refunds(first: 10) { id }
          displayFulfillmentStatus
        }
      }
    `, { id: orderId });
    console.log('Created order:', fullOrder.order.name);
    return fullOrder.order;
  }

  // --- Apply fulfillment via GraphQL ---
  async function fulfillOrder(order, lineItemTitles) {
    // Get fulfillment orders
    const foData = await gql(`
      query getFO($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                lineItems(first: 50) {
                  edges { node { id totalQuantity lineItem { id title } } }
                }
              }
            }
          }
        }
      }
    `, { id: order.id });

    for (const foEdge of foData.order.fulfillmentOrders.edges) {
      const fo = foEdge.node;
      const foLineItems = fo.lineItems.edges
        .filter(e => lineItemTitles.includes(e.node.lineItem?.title))
        .map(e => ({ id: e.node.id, quantity: e.node.totalQuantity }));
      if (!foLineItems.length) continue;
      const trackingNum = `TRK${Math.floor(Math.random() * 900000 + 100000)}`;
      const res = await gql(`
        mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment { id trackingInfo { number } }
            userErrors { field message }
          }
        }
      `, {
        fulfillment: {
          notifyCustomer: false,
          trackingInfo: { company: 'FakeCarrier', number: trackingNum },
          lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: fo.id, fulfillmentOrderLineItems: foLineItems }],
        },
      });
      if (res.fulfillmentCreate.userErrors?.length) {
        console.error('Fulfillment errors:', res.fulfillmentCreate.userErrors);
      } else {
        console.log(`Fulfilled ${order.name} with tracking ${trackingNum}`);
      }
    }
  }

  // --- Apply refund via GraphQL ---
  async function refundOrder(order) {
    const lineItem = order.lineItems.edges[0]?.node;
    if (!lineItem) return;
    const idempotencyKey = `seed-refund-${order.name}-${Date.now()}`;
    const res = await gql(`
      mutation refundCreate($input: RefundInput!, $idempotencyKeyVar: String!) {
        refundCreate(input: $input) @idempotent(key: $idempotencyKeyVar) {
          refund { id }
          userErrors { field message }
        }
      }
    `, {
      input: {
        orderId: order.id,
        refundLineItems: [{ lineItemId: lineItem.id, quantity: lineItem.quantity, restockType: 'NO_RESTOCK' }],
        currency: 'USD',
        notify: true,
      },
      idempotencyKeyVar: idempotencyKey,
    });
    if (res.refundCreate.userErrors?.length) {
      console.error('Refund errors:', res.refundCreate.userErrors);
    } else {
      console.log(`Refunded ${order.name}`);
    }
  }

  // --- Reconcile each desired order ---
  for (const desired of desiredOrders) {
    let order = matchOrder(desired);
    if (!order) {
      order = await createOrder(desired);
    } else {
      console.log(`Order ${order.name} already exists for ${desired.email} / ${desired.product}`);
    }

    const hasFulfillments = (order.fulfillments?.length ?? 0) > 0;
    const hasRefunds = (order.refunds?.length ?? 0) > 0;

    if (desired.state === 'fulfilled' && !hasFulfillments) {
      const titles = [desired.product];
      if (desired.extra) titles.push(desired.extra.product);
      await fulfillOrder(order, titles);
    } else if (desired.state === 'partial' && !hasFulfillments) {
      // Only fulfill the first line item
      await fulfillOrder(order, [desired.product]);
    } else if (desired.state === 'refunded' && !hasRefunds) {
      await refundOrder(order);
    }
  }

  // --- Store policy ---
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: policyError } = await supabase.from('store_policies').upsert({
    key: 'returns',
    text: 'Return policy: 30 days from delivery. Items must be unworn with tags attached. Free exchanges for size issues. Refunds go to the original payment method.',
  });
  if (policyError) console.error('Policy insert error:', policyError.message);
  else console.log('Store policy inserted');

  // --- Summary ---
  const finalOrders = await gql(`
    query getOrders {
      orders(first: 50, query: "note:'Test order for Store Concierge'") {
        edges {
          node {
            name
            customer { email }
            displayFulfillmentStatus
            fulfillments(first: 5) { trackingInfo { number } }
            refunds(first: 5) { id }
          }
        }
      }
    }
  `);
  console.log('\n=== Final test orders ===');
  for (const e of finalOrders.orders.edges) {
    const o = e.node;
    const tracking = (o.fulfillments || []).map(f => f.trackingInfo?.[0]?.number || 'none').join(',');
    const refunded = (o.refunds?.length ?? 0) > 0 ? 'REFUNDED' : '';
    console.log(`${o.name} | ${o.customer?.email} | ${o.displayFulfillmentStatus} | tracking:${tracking} | ${refunded}`);
  }
  console.log(`\nTotal: ${finalOrders.orders.edges.length} test orders`);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});

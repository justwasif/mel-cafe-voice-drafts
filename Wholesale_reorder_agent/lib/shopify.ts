import { z } from 'zod';
import { connection } from 'next/server';

const env = z.object({
  SHOPIFY_STORE_DOMAIN: z.string().min(1),
  SHOPIFY_API_VERSION: z.string().min(1),
  SHOPIFY_ADMIN_ACCESS_TOKEN: z.string().optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
}).parse(process.env);

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (env.SHOPIFY_ADMIN_ACCESS_TOKEN) return env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
    throw new Error('No Shopify credentials available');
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  // Signal to Cache Components that this render may use runtime data
  await connection();
  // Shopify client-credentials grant for Dev Dashboard app installed on a dev store
  const url = `https://${env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.SHOPIFY_CLIENT_ID,
    client_secret: env.SHOPIFY_CLIENT_SECRET,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Shopify token error: ${JSON.stringify(data)}`);
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 86400) * 1000 - 300_000, // refresh 5 min early
  };
  return cachedToken.token;
}

async function shopifyGraphQL<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
  const token = await getAccessToken();
  const url = `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json();
      if (json.errors) {
        throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
      }
      return json.data as T;
    } catch (e) {
      lastErr = e;
      if (attempt < 5) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function getOrderByName(orderName: string) {
  const data = await shopifyGraphQL<{ orders: { edges: Array<{ node: any }> } }>(`
    query getOrder($query: String!) {
      orders(first: 1, query: $query) {
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { email firstName lastName }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  quantity
                  image { url altText }
                  variant {
                    id
                    title
                    price
                    inventoryQuantity
                  }
                  refundableQuantity
                }
              }
            }
            fulfillments {
              id
              trackingInfo { number url company }
            }
            refunds {
              id
              totalRefundedSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    }
  `, { query: `name:${orderName}` });
  return data.orders.edges[0]?.node ?? null;
}

export async function getProducts(query?: string) {
  const data = await shopifyGraphQL<{ products: { edges: Array<{ node: any }> } }>(`
    query getProducts($query: String) {
      products(first: 50, query: $query) {
        edges {
          node {
            id
            title
            description
            featuredImage { url altText }
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
            metafields(first: 10) {
              edges {
                node { namespace key value type }
              }
            }
          }
        }
      }
    }
  `, { query: query || undefined });
  return data.products.edges.map((e: any) => e.node);
}

export async function createCustomer(input: {
  email: string;
  firstName?: string;
  lastName?: string;
}) {
  const data = await shopifyGraphQL<{ customerCreate: { customer: any; userErrors: any[] } }>(`
    mutation customerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id email }
        userErrors { field message }
      }
    }
  `, { input });
  return data.customerCreate;
}

export async function createProduct(input: {
  title: string;
  descriptionHtml?: string;
  variants: Array<{ price: string; sku?: string; options?: string[]; inventoryQuantities?: Array<{ availableQuantity: number; locationId: string }> }>;
  options?: string[];
  metafields?: Array<{ namespace: string; key: string; value: string; type: string }>;
}) {
  const data = await shopifyGraphQL<{ productCreate: { product: any; userErrors: any[] } }>(`
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id title }
        userErrors { field message }
      }
    }
  `, { input });
  return data.productCreate;
}

export async function createDraftOrder(input: any) {
  const data = await shopifyGraphQL<{ draftOrderCreate: { draftOrder: any; userErrors: any[] } }>(`
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { field message }
      }
    }
  `, { input });
  return data.draftOrderCreate;
}

export async function completeDraftOrder(draftOrderId: string) {
  const data = await shopifyGraphQL<{ draftOrderComplete: { draftOrder: any; userErrors: any[] } }>(`
    mutation draftOrderComplete($id: ID!) {
      draftOrderComplete(id: $id) {
        draftOrder { id order { id name } }
        userErrors { field message }
      }
    }
  `, { id: draftOrderId });
  return data.draftOrderComplete;
}

export async function markOrderAsPaid(orderId: string) {
  const data = await shopifyGraphQL<{ orderMarkAsPaid: { order: any; userErrors: any[] } }>(`
    mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
      orderMarkAsPaid(input: $input) {
        order { id }
        userErrors { field message }
      }
    }
  `, { input: { id: orderId } });
  return data.orderMarkAsPaid;
}

// The order's successful payment (SALE or CAPTURE) — a refund transaction must point at it.
async function getRefundableTransaction(orderId: string) {
  const data = await shopifyGraphQL<{ order: { transactions: Array<{ id: string; kind: string; status: string; gateway: string; amountSet: { shopMoney: { amount: string } } }> } }>(`
    query orderTransactions($id: ID!) {
      order(id: $id) {
        transactions { id kind status gateway amountSet { shopMoney { amount } } }
      }
    }
  `, { id: orderId });
  return data.order?.transactions.find(t => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS') ?? null;
}

export async function createRefund(
  orderId: string,
  refundLineItems: Array<{ lineItemId: string; quantity: number; restockType: string }>,
  currency: string,
  amount: number,
) {
  // Without a REFUND transaction Shopify only records returned items and refunds $0.
  const parent = await getRefundableTransaction(orderId);
  if (!parent) throw new Error('No successful payment found on this order to refund.');
  const refundAmount = Math.min(amount, Number(parent.amountSet.shopMoney.amount));
  if (!(refundAmount > 0)) throw new Error('Refund amount must be greater than zero.');

  const input = {
    orderId,
    refundLineItems,
    currency,
    notify: true,
    transactions: [{
      orderId,
      parentId: parent.id,
      gateway: parent.gateway,
      kind: 'REFUND',
      amount: refundAmount.toFixed(2),
    }],
  };
  const idempotencyKey = `refund-${orderId}-${Date.now()}`;
  const data = await shopifyGraphQL<{ refundCreate: { refund: any; userErrors: any[] } }>(`
    mutation refundCreate($input: RefundInput!, $idempotencyKey: String!) {
      refundCreate(input: $input) @idempotent(key: $idempotencyKey) {
        refund { id totalRefundedSet { shopMoney { amount currencyCode } } }
        userErrors { field message }
      }
    }
  `, { input, idempotencyKey });
  return data.refundCreate;
}

export async function createDiscountCode(percent: number, code: string, expiresAt: string) {
  const data = await shopifyGraphQL<{ discountCodeBasicCreate: { codeDiscountNode: any; userErrors: any[] } }>(`
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              codes(first: 1) { edges { node { code } } }
            }
          }
        }
        userErrors { field message }
      }
    }
  `, {
    basicCodeDiscount: {
      title: code,
      code: code,
      startsAt: new Date().toISOString(),
      endsAt: expiresAt,
      customerSelection: { all: true },
      customerGets: {
        value: {
          percentage: percent,
        },
        items: {
          all: true,
        },
      },
      appliesOncePerCustomer: true,
      usageLimit: 1,
    },
  });
  return data.discountCodeBasicCreate;
}

export async function getLocations() {
  const data = await shopifyGraphQL<{ locations: { edges: Array<{ node: any }> } }>(`
    query getLocations {
      locations(first: 10) {
        edges { node { id name } }
      }
    }
  `);
  return data.locations.edges.map((e: any) => e.node);
}

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "sample-pricing");

interface Plan {
  name: string;
  price: number | null;
  priceAnnual: number | null;
  seats: number | null;
  storage: string | null;
  features: string[];
}

interface PageData {
  slug: string;
  name: string;
  versions: Array<{
    version: number;
    title: string;
    headline: string;
    plans: Plan[];
  }>;
}

export async function generateStaticParams() {
  const files = await fs.readdir(DATA_DIR);
  const slugs = files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  return slugs.map((slug) => ({ slug }));
}

async function getPageData(slug: string): Promise<PageData> {
  const raw = await fs.readFile(path.join(DATA_DIR, `${slug}.json`), "utf8");
  return JSON.parse(raw) as PageData;
}

// Version is selected by ?v=N query param; defaults to the current version from state file
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  let data: PageData;
  try {
    data = await getPageData(slug);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  // Determine which version to serve
  const url = new URL(request.url);
  const vParam = url.searchParams.get("v");
  let versionNum = 1;
  if (vParam) {
    versionNum = parseInt(vParam, 10);
  } else {
    // Read current version from state file
    try {
      const stateRaw = await fs.readFile(path.join(process.cwd(), "data", "sample-pricing-state.json"), "utf8");
      const state = JSON.parse(stateRaw);
      versionNum = state[slug] || 1;
    } catch {
      versionNum = 1;
    }
  }

  const ver = data.versions.find((v) => v.version === versionNum) ?? data.versions[data.versions.length - 1];
  if (!ver) {
    return new Response("No versions available", { status: 404 });
  }

  const html = renderPricingPage(data.name, ver.title, ver.headline, ver.plans);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPricingPage(
  name: string,
  title: string,
  headline: string,
  plans: Plan[]
): string {
  const planCards = plans
    .map((plan) => {
      const priceDisplay =
        plan.price === 0
          ? `<span class="price-free">Free</span>`
          : `<span class="price-amount">$${plan.price}</span><span class="price-period">/mo</span>`;
      const annualDisplay = plan.priceAnnual
        ? `<div class="annual">$${plan.priceAnnual}/year <span class="save">save ${Math.round(((plan.price! * 12 - plan.priceAnnual!) / (plan.price! * 12)) * 100)}%</span></div>`
        : "";
      const seatsDisplay = plan.seats ? `<div class="meta-item"><strong>${plan.seats}</strong> seats</div>` : "";
      const storageDisplay = plan.storage ? `<div class="meta-item">${plan.storage} storage</div>` : "";
      const featuresList = plan.features.map((f) => `<li>${f}</li>`).join("\n        ");

      return `
      <div class="plan-card" data-plan="${plan.name.toLowerCase()}">
        <h3 class="plan-name">${plan.name}</h3>
        <div class="plan-price">${priceDisplay}</div>
        ${annualDisplay}
        <div class="plan-meta">
          ${seatsDisplay}${storageDisplay}
        </div>
        <ul class="plan-features">
          ${featuresList}
        </ul>
        <button class="plan-cta">Get started</button>
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff; color: #111; line-height: 1.5; }
  .container { max-width: 960px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
  .headline { font-size: 18px; color: #555; margin-bottom: 48px; }
  .plans { display: grid; grid-template-columns: repeat(${plans.length}, 1fr); gap: 24px; }
  .plan-card { border: 1px solid #e0e0e0; border-radius: 12px; padding: 28px 24px; display: flex; flex-direction: column; }
  .plan-name { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
  .plan-price { font-size: 36px; font-weight: 700; margin-bottom: 8px; }
  .price-period { font-size: 14px; font-weight: 400; color: #666; }
  .price-free { font-size: 36px; font-weight: 700; color: #059669; }
  .annual { font-size: 13px; color: #666; margin-bottom: 16px; }
  .save { color: #059669; font-weight: 600; }
  .plan-meta { display: flex; gap: 16px; font-size: 13px; color: #666; margin-bottom: 20px; flex-wrap: wrap; }
  .plan-features { list-style: none; flex: 1; margin-bottom: 24px; }
  .plan-features li { padding: 6px 0; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
  .plan-features li:last-child { border-bottom: none; }
  .plan-cta { width: 100%; padding: 10px; background: #111; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
</style>
</head>
<body>
<div class="container">
  <h1>${name}</h1>
  <p class="headline">${headline}</p>
  <div class="plans">
    ${planCards}
  </div>
</div>
</body>
</html>`;
}

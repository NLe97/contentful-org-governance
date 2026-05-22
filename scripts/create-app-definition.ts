export {};
import { webcrypto } from "node:crypto";
// Creates a Contentful App Definition for this app, pointing at the customer's
// Vercel deployment. Run once per org. Prints the App Definition ID + the
// generated signing secret so you can paste both into Vercel env vars.
//
// Required env:
//   CONTENTFUL_MANAGEMENT_TOKEN  Org admin PAT
//   CF_ORG_ID                    Target org ID
//   APP_URL                      Vercel deployment URL (e.g. https://gov-app.vercel.app)
//
// Usage:
//   pnpm tsx scripts/create-app-definition.ts
//
// What it does:
//   1. Creates an App Definition named "Org Governance" with:
//      - locations: app-config (wizard), page (console), dialog
//      - src: ${APP_URL}
//   2. Generates an App Signing Secret and prints it.
//   3. Does NOT create an App Installation — the customer does that from the
//      Contentful UI (Org Settings → Apps → install in console space).

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Missing required env: ${name}`); process.exit(2); }
  return v;
}
const PAT = reqEnv("CONTENTFUL_MANAGEMENT_TOKEN");
const ORG = reqEnv("CF_ORG_ID");
const APP_URL = reqEnv("APP_URL");

const HEADERS = {
  Authorization: `Bearer ${PAT}`,
  "Content-Type": "application/vnd.contentful.management.v1+json"
};

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.contentful.com${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} -> ${res.status} ${res.statusText}\n${text}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("json") ? res.json() : ({} as T);
}

const appDef = await api<{ sys: { id: string }; name: string }>(
  "POST",
  `/organizations/${ORG}/app_definitions`,
  {
    name: "Org Governance",
    src: APP_URL,
    locations: [
      { location: "app-config" },
      { location: "page" },
      { location: "dialog" }
    ]
  }
);
console.log("Created App Definition:");
console.log("  ID:  ", appDef.sys.id);
console.log("  Name:", appDef.name);

const signingSecret = await api<{ value: string }>(
  "PUT",
  `/organizations/${ORG}/app_definitions/${appDef.sys.id}/signing_secret`,
  { value: cryptoRandom(64) }
);
console.log("\nGenerated App Signing Secret (store as APP_SIGNING_SECRET in Vercel):");
console.log("  ", signingSecret.value);

console.log("\nNext steps:");
console.log(`  1. In Vercel project env:`);
console.log(`     APP_DEFINITION_ID=${appDef.sys.id}`);
console.log(`     APP_SIGNING_SECRET=${signingSecret.value}`);
console.log(`     CONTENTFUL_MANAGEMENT_TOKEN=<your PAT>`);
console.log(`  2. Redeploy.`);
console.log(`  3. In Contentful UI: Org Settings → Apps → Org Governance → Install`);
console.log(`     into the space you want to be the console (audit log + UI).`);

function cryptoRandom(len: number): string {
  // Use node:crypto.webcrypto.getRandomValues so this works on Node 18 (which
  // doesn't expose the Web Crypto API as a global) as well as 19+ / 20 / 22.
  const bytes = new Uint8Array(len);
  webcrypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

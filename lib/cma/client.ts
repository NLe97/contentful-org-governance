import cmaPkg from "contentful-management";
import { getManagementToken } from "@contentful/node-apps-toolkit";
import { TokenCache } from "./token-cache.js";

// NOTE: Use default import with named destructuring due to Node ESM compatibility
// with contentful-management@11 (named imports break).
const { createClient } = cmaPkg;
type ClientAPI = ReturnType<typeof createClient>;

const APP_DEF = process.env.APP_DEFINITION_ID;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
const DEV_PAT = process.env.CF_DEV_PAT;

async function mintAppToken(_orgId: string, spaceId: string) {
  if (!APP_DEF || !APP_PRIVATE_KEY) throw new Error("App Identity env not configured");
  const token = await getManagementToken(APP_PRIVATE_KEY, {
    appInstallationId: APP_DEF,
    spaceId,
    environmentId: "master"
  });
  return { token, expiresAt: Date.now() + 9 * 60_000 };
}

const cache = new TokenCache(mintAppToken);

// NOTE: _orgId parameter is unused; prefixed with underscore to satisfy strict mode.
export async function cmaForSpace(_orgId: string, spaceId: string): Promise<ClientAPI> {
  const accessToken = DEV_PAT ?? (await cache.get(_orgId, spaceId));
  return createClient({ accessToken });
}

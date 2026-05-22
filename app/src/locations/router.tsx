import React, { useEffect, useState } from "react";
import { locations } from "@contentful/app-sdk";
import { Spinner } from "@contentful/f36-components";
import { AppConfig } from "./app-config";
import { PageConsole } from "./page-console";
import { PageFrozen } from "./page-frozen";
import { Restricted } from "./restricted";
import { api } from "../api-client";

export function Router({ sdk }: { sdk: any }) {
  const loc = sdk.location;

  // App-config (install wizard) is the one place we cannot gate on org-admin
  // status: the installation does not yet exist, so /api/me has no
  // installation params to verify against. Contentful itself restricts the
  // install wizard to users who can install apps in a space — sufficient.
  if (loc.is(locations.LOCATION_APP_CONFIG)) return <AppConfig sdk={sdk} />;

  if (loc.is(locations.LOCATION_PAGE)) {
    return <GatedPage sdk={sdk} />;
  }
  return null;
}

function GatedPage({ sdk }: { sdk: any }) {
  const [state, setState] = useState<"loading" | "allowed" | "denied" | "unconfigured">("loading");

  useEffect(() => {
    const consoleSpaceId = sdk.parameters.installation?.consoleSpaceId;
    if (!consoleSpaceId) { setState("unconfigured"); return; }
    api.me(sdk, { orgId: sdk.ids.organization, consoleSpaceId })
      .then((r: any) => setState(r.isOrgAdmin ? "allowed" : "denied"))
      .catch(() => setState("denied"));
  }, []);

  if (state === "loading") return <Spinner />;
  if (state === "unconfigured") return <Restricted reason="unconfigured" />;
  if (state === "denied") return <Restricted reason="not-admin" />;

  const isConsole = sdk.ids.space === sdk.parameters.installation?.consoleSpaceId;
  return isConsole ? <PageConsole sdk={sdk} /> : <PageFrozen sdk={sdk} />;
}

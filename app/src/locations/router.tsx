import React from "react";
import { locations } from "@contentful/app-sdk";
import { AppConfig } from "./app-config";
import { PageConsole } from "./page-console";
import { PageFrozen } from "./page-frozen";

export function Router({ sdk }: { sdk: any }) {
  const loc = sdk.location;
  if (loc.is(locations.LOCATION_APP_CONFIG)) return <AppConfig sdk={sdk} />;
  if (loc.is(locations.LOCATION_PAGE)) {
    const isConsole = sdk.ids.space === sdk.parameters.installation?.consoleSpaceId;
    return isConsole ? <PageConsole sdk={sdk} /> : <PageFrozen sdk={sdk} />;
  }
  return null;
}

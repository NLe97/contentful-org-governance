import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { SDKProvider, useSDK } from "@contentful/react-apps-toolkit";
import { Router } from "./locations/router";

function App() {
  const sdk = useSDK();
  useEffect(() => {
    // Tell Contentful's host the app has finished initializing.
    // Without this, the parent sees "App failed to load" after its timeout.
    (sdk as any)?.app?.setReady?.();
  }, [sdk]);
  if (!sdk) return null;
  return <Router sdk={sdk} />;
}

createRoot(document.getElementById("root")!).render(<SDKProvider><App /></SDKProvider>);

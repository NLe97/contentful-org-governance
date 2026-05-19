import React from "react";
import { createRoot } from "react-dom/client";
import { SDKProvider, useSDK } from "@contentful/react-apps-toolkit";
import { Router } from "./locations/router";

function App() { const sdk = useSDK(); return <Router sdk={sdk} />; }
createRoot(document.getElementById("root")!).render(<SDKProvider><App /></SDKProvider>);

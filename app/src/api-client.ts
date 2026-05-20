type AppSdk = any;

async function callSigned(sdk: AppSdk, path: string, init: RequestInit) {
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body as string | undefined;

  // Ask Contentful to sign the request. We pass the method/path/headers/body
  // we *intend* to send so the signature covers the canonical request.
  const signed = await sdk.cma.appSignedRequest.create(
    { appDefinitionId: sdk.ids.app! },
    {
      method,
      headers: { "Content-Type": "application/json" } as any,
      path,
      body: body ?? ""
    }
  );

  // The signing response gives us signature headers under one of these names
  // depending on SDK version.
  const sigHeaders =
    (signed as any).additionalHeaders ??
    (signed as any).headers ??
    {};

  const fetchInit: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...sigHeaders }
  };
  if (method !== "GET" && method !== "HEAD" && body !== undefined) {
    fetchInit.body = body;
  }

  const url = `${(window as any).GOV_API_BASE ?? ""}${path}`;
  const res = await fetch(url, fetchInit);
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`HTTP ${res.status}: ${text}`), { status: res.status, body: text });
  }
  return res.json();
}

export const api = {
  bootstrap: (sdk: AppSdk, body: object) => callSigned(sdk, "/api/bootstrap", { method: "POST", body: JSON.stringify(body) }),
  toggleFreeze: (sdk: AppSdk, body: object) => callSigned(sdk, "/api/toggle-freeze", { method: "POST", body: JSON.stringify(body) }),
  getState: (sdk: AppSdk, q: Record<string, string>) =>
    callSigned(sdk, `/api/state?${new URLSearchParams(q).toString()}`, { method: "GET" }),
  listSpaces: (sdk: AppSdk, q: Record<string, string>) =>
    callSigned(sdk, `/api/spaces?${new URLSearchParams(q).toString()}`, { method: "GET" })
};

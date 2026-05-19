type AppSdk = any;

async function callSigned(sdk: AppSdk, path: string, init: RequestInit) {
  const signed = await sdk.cma.appSignedRequest.create({ appDefinitionId: sdk.ids.app! }, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json" } as any,
    path,
    body: init.body as any ?? ""
  });
  const url = `${(window as any).GOV_API_BASE ?? ""}${path}`;
  const res = await fetch(url, { method: signed.method, headers: signed.headers as any, body: init.body });
  if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status, body: await res.text() });
  return res.json();
}

export const api = {
  bootstrap: (sdk: AppSdk, body: object) => callSigned(sdk, "/api/bootstrap", { method: "POST", body: JSON.stringify(body) }),
  toggleFreeze: (sdk: AppSdk, body: object) => callSigned(sdk, "/api/toggle-freeze", { method: "POST", body: JSON.stringify(body) }),
  getState: (sdk: AppSdk, q: Record<string, string>) =>
    callSigned(sdk, `/api/state?${new URLSearchParams(q).toString()}`, { method: "GET" })
};

import React, { useEffect, useState } from "react";
import { Button, Badge, Stack } from "@contentful/f36-components";
import { api } from "../api-client";

export function FreezeToggle({ sdk, spaceId }: { sdk: any; spaceId: string }) {
  const [status, setStatus] = useState<string>("OFF");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await api.getState(sdk, { spaceId, orgId: sdk.ids.organization, consoleSpaceId: sdk.parameters.installation?.consoleSpaceId });
    setStatus(r.freezeStatus);
  }
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [spaceId]);

  async function toggle() {
    setBusy(true);
    try {
      await api.toggleFreeze(sdk, {
        spaceId, orgId: sdk.ids.organization,
        consoleSpaceId: sdk.parameters.installation?.consoleSpaceId,
        action: status === "OFF" ? "freeze" : "thaw"
      });
      await refresh();
    } finally { setBusy(false); }
  }

  const variant = status === "FROZEN" ? "negative" : status === "OFF" ? "positive" : "warning";
  return (
    <Stack>
      <Badge variant={variant}>{status}</Badge>
      <Button size="small" onClick={toggle} isLoading={busy} isDisabled={status === "TRANSITIONING_ON" || status === "TRANSITIONING_OFF"}>
        {status === "OFF" ? "Freeze" : "Thaw"}
      </Button>
    </Stack>
  );
}

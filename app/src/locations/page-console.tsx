import React, { useEffect, useState } from "react";
import { Stack, Heading, Tabs, Spinner, Note, Button, Paragraph } from "@contentful/f36-components";
import { SpaceList } from "../console/space-list";
import { AuditLog } from "../console/audit-log";
import { api } from "../api-client";

type BootstrapStatus = "pending" | "running" | "done" | "error";

export function PageConsole({ sdk }: { sdk: any }) {
  const [status, setStatus] = useState<BootstrapStatus>("pending");
  const [error, setError] = useState<string>();
  const [summary, setSummary] = useState<any>();

  async function runBootstrap() {
    setStatus("running"); setError(undefined);
    try {
      const params = sdk.parameters?.installation ?? {};
      const result = await api.bootstrap(sdk, {
        orgId: sdk.ids.organization,
        installationId: sdk.ids.app,
        consoleSpaceId: sdk.ids.space,
        orgAdminsTeamName: params.orgAdminsTeamName ?? "Org Admins",
        initialTeamMemberUserIds: params.initialMembers ?? [sdk.ids.user]
      });
      setSummary(result);
      setStatus("done");
    } catch (e: any) {
      setError(e?.body ?? e?.message ?? String(e));
      setStatus("error");
    }
  }

  useEffect(() => { runBootstrap(); }, []);

  if (status === "pending" || status === "running") {
    return (
      <Stack flexDirection="column" padding="spacingXl" spacing="spacingM" alignItems="center">
        <Spinner />
        <Paragraph>Running first-time setup (content types, team, webhooks, initial sweep)…</Paragraph>
      </Stack>
    );
  }
  if (status === "error") {
    return (
      <Stack flexDirection="column" padding="spacingXl" spacing="spacingM">
        <Heading>Setup failed</Heading>
        <Note variant="negative">{error}</Note>
        <Button onClick={runBootstrap}>Retry</Button>
      </Stack>
    );
  }

  return (
    <Stack flexDirection="column" padding="spacingXl" spacing="spacingL">
      <Heading>Org Governance Console</Heading>
      {summary && <Note variant="positive">Setup complete. Sweep: {JSON.stringify(summary.swept ?? {})}</Note>}
      <Tabs defaultTab="spaces">
        <Tabs.List><Tabs.Tab panelId="spaces">Spaces</Tabs.Tab><Tabs.Tab panelId="audit">Audit log</Tabs.Tab></Tabs.List>
        <Tabs.Panel id="spaces"><SpaceList sdk={sdk} /></Tabs.Panel>
        <Tabs.Panel id="audit"><AuditLog sdk={sdk} /></Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

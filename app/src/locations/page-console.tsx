import React from "react";
import { Stack, Heading, Tabs } from "@contentful/f36-components";
import { SpaceList } from "../console/space-list";
import { AuditLog } from "../console/audit-log";

export function PageConsole({ sdk }: { sdk: any }) {
  return (
    <Stack flexDirection="column" padding="spacingXl" spacing="spacingL">
      <Heading>Org Governance Console</Heading>
      <Tabs defaultTab="spaces">
        <Tabs.List><Tabs.Tab panelId="spaces">Spaces</Tabs.Tab><Tabs.Tab panelId="audit">Audit log</Tabs.Tab></Tabs.List>
        <Tabs.Panel id="spaces"><SpaceList sdk={sdk} /></Tabs.Panel>
        <Tabs.Panel id="audit"><AuditLog sdk={sdk} /></Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

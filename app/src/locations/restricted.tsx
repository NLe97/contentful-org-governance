import React from "react";
import { Heading, Paragraph, Stack } from "@contentful/f36-components";

type Reason = "not-admin" | "unconfigured";

export function Restricted({ reason = "not-admin" }: { reason?: Reason } = {}) {
  if (reason === "unconfigured") {
    return (
      <Stack flexDirection="column" spacing="spacingL" padding="spacingXl" alignItems="center">
        <Heading style={{ fontSize: 56 }}>⚙️</Heading>
        <Heading>Installation not configured</Heading>
        <Paragraph>
          This app is installed but its parameters were never saved. Go to the
          console space → top-right gear icon → Apps → Org Governance → Configure.
          Walk through every step of the wizard and click <strong>Save</strong> on
          the Review step.
        </Paragraph>
      </Stack>
    );
  }
  return (
    <Stack flexDirection="column" spacing="spacingL" padding="spacingXl" alignItems="center">
      <Heading style={{ fontSize: 56 }}>🔒</Heading>
      <Heading>Restricted to Org Admins</Heading>
      <Paragraph>
        This app is only available to Organization Admins and Owners. If you
        believe you should have access, contact your org admin.
      </Paragraph>
    </Stack>
  );
}

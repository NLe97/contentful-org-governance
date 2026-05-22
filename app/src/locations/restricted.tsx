import React from "react";
import { Heading, Paragraph, Stack } from "@contentful/f36-components";

export function Restricted() {
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

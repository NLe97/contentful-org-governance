import React from "react";
import { Stack, Paragraph, Button, Note } from "@contentful/f36-components";
export function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <Paragraph>This app installs two governance capabilities across your org:</Paragraph>
      <ul>
        <li><b>Protected org-admin access</b> via an auto-attached team.</li>
        <li><b>Role/permission freeze</b> per space via role substitution.</li>
      </ul>
      <Note variant="warning">The wizard will create or attach to one space and create one team, two webhooks, plus three content types. You must be an Org Admin or Owner.</Note>
      <Button variant="primary" onClick={onNext}>Get started</Button>
    </Stack>
  );
}

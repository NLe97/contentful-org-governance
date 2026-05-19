import React from "react";
import { Stack, Heading, Paragraph, Button } from "@contentful/f36-components";
import type { WizardState } from "../locations/app-config";

export function StepDone({ sdk, state }: { sdk: any; state: WizardState }) {
  function openConsole() {
    sdk.navigator.openPageExtension({ id: sdk.ids.app, path: "/", spaceId: state.consoleSpaceId });
  }
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <Heading>All set up</Heading>
      <Paragraph>The app is installed in your org. The Org Admins team is attached to your existing spaces, and webhooks are registered.</Paragraph>
      <Button variant="primary" onClick={openConsole}>Open governance console</Button>
    </Stack>
  );
}

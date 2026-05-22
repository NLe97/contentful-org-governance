import React from "react";
import { Stack, Button, Note } from "@contentful/f36-components";
import type { WizardState } from "../locations/app-config";

export function StepReview({ state, onBack }:
  { sdk: any; state: WizardState; onNext: () => void; onBack: () => void }) {
  // onConfigure is registered at the AppConfig level so the parameters
  // callback is always set, even if the user clicks Save before reaching
  // this step.
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <table>
        <tbody>
          <tr><td>Console space</td><td>{state.consoleSpaceName ?? state.consoleSpaceId} ({state.consoleSpaceId})</td></tr>
          <tr><td>Org Admins team</td><td>{state.orgAdminsTeamName} ({state.initialMembers.length} member(s))</td></tr>
          <tr><td>Content types</td><td>governanceConfig, spaceState, auditEvent (created on first console load)</td></tr>
          <tr><td>Webhooks</td><td>Space.create, TeamSpaceMembership.delete (created on first console load)</td></tr>
        </tbody>
      </table>
      <Note variant="primary">
        <strong>Click the "Save" button at the top-right of this page to finish installation.</strong> Open the Governance Console afterward to complete first-time setup (creates content types, team, webhooks, and runs the first sweep).
      </Note>
      <Stack><Button onClick={onBack}>Back</Button></Stack>
    </Stack>
  );
}

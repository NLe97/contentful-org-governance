import React, { useState } from "react";
import { Stack, Button, Note, Spinner } from "@contentful/f36-components";
import type { WizardState } from "../locations/app-config";
import { api } from "../api-client";

export function StepReview({ sdk, state, onNext, onBack }:
  { sdk: any; state: WizardState; onNext: () => void; onBack: () => void }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  async function install() {
    setRunning(true); setError(undefined);
    try {
      await api.bootstrap(sdk, {
        orgId: sdk.ids.organization,
        installationId: sdk.ids.app,
        consoleSpaceId: state.consoleSpaceId,
        orgAdminsTeamName: state.orgAdminsTeamName,
        initialTeamMemberUserIds: state.initialMembers
      });
      await sdk.app.setParameters({ consoleSpaceId: state.consoleSpaceId });
      onNext();
    } catch (e: any) { setError(e.body ?? e.message); }
    finally { setRunning(false); }
  }
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <table>
        <tbody>
          <tr><td>Console space</td><td>{state.consoleSpaceName} ({state.consoleSpaceId})</td></tr>
          <tr><td>Org Admins team</td><td>{state.orgAdminsTeamName} ({state.initialMembers.length} member(s))</td></tr>
          <tr><td>Content types</td><td>governanceConfig, spaceState, auditEvent</td></tr>
          <tr><td>Webhooks</td><td>Space.create, TeamSpaceMembership.delete</td></tr>
        </tbody>
      </table>
      {error && <Note variant="negative">{error}</Note>}
      {running && <Spinner />}
      <Stack><Button onClick={onBack} isDisabled={running}>Back</Button><Button variant="primary" onClick={install} isDisabled={running}>Install</Button></Stack>
    </Stack>
  );
}

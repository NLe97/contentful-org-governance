import React, { useEffect, useState } from "react";
import { Stack, Heading } from "@contentful/f36-components";
import { StepWelcome } from "../wizard/step-welcome";
import { StepPreflight } from "../wizard/step-preflight";
import { StepTeam } from "../wizard/step-team";
import { StepReview } from "../wizard/step-review";
import { StepDone } from "../wizard/step-done";

export type WizardState = {
  consoleSpaceId: string;
  consoleSpaceName?: string;
  orgAdminsTeamName: string;
  initialMembers: string[];
  preflight: { passed: boolean; failures: string[] };
};

export function AppConfig({ sdk }: { sdk: any }) {
  useEffect(() => { sdk.app?.setReady?.(); }, [sdk]);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    // The install space IS the console space. App SDK can't enumerate/create
    // other spaces, so we use the one the app is being installed into.
    consoleSpaceId: sdk.ids.space,
    consoleSpaceName: undefined,
    orgAdminsTeamName: "Org Admins",
    initialMembers: [sdk.ids.user],
    preflight: { passed: false, failures: [] }
  });

  // Register onConfigure at the AppConfig level so Contentful always has a
  // parameters callback, regardless of which wizard step the user is on
  // when they click Save. Earlier this was only done in StepReview, so any
  // user who clicked Save before reaching Review installed the app with NO
  // parameters and saw the Restricted screen afterward.
  useEffect(() => {
    sdk.app?.onConfigure?.(() => ({
      parameters: {
        orgAdminsTeamName: state.orgAdminsTeamName,
        initialMembers: state.initialMembers,
        consoleSpaceId: state.consoleSpaceId
      }
    }));
  }, [sdk, state]);
  const steps = [
    <StepWelcome key={0} onNext={() => setStep(1)} />,
    <StepPreflight key={1} sdk={sdk} onNext={(r) => { setState({ ...state, preflight: r }); setStep(2); }} onBack={() => setStep(0)} />,
    <StepTeam key={2} sdk={sdk} state={state} setState={setState} onBack={() => setStep(1)} onNext={() => setStep(3)} />,
    <StepReview key={3} sdk={sdk} state={state} onBack={() => setStep(2)} onNext={() => setStep(4)} />,
    <StepDone key={4} sdk={sdk} state={state} />
  ];
  return (
    <Stack flexDirection="column" spacing="spacingL" padding="spacingXl">
      <Heading>Org Governance — Setup</Heading>
      {steps[step]}
    </Stack>
  );
}

import React, { useEffect, useState } from "react";
import { Stack, Heading } from "@contentful/f36-components";
import { StepWelcome } from "../wizard/step-welcome";
import { StepPreflight } from "../wizard/step-preflight";
import { StepConsoleSpace } from "../wizard/step-console-space";
import { StepTeam } from "../wizard/step-team";
import { StepReview } from "../wizard/step-review";
import { StepDone } from "../wizard/step-done";

export type WizardState = {
  consoleSpaceId?: string;
  consoleSpaceName?: string;
  orgAdminsTeamName: string;
  initialMembers: string[];
  preflight: { passed: boolean; failures: string[] };
};

export function AppConfig({ sdk }: { sdk: any }) {
  useEffect(() => { sdk.app?.setReady?.(); }, [sdk]);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    orgAdminsTeamName: "Org Admins",
    initialMembers: [sdk.ids.user],
    preflight: { passed: false, failures: [] }
  });
  const steps = [
    <StepWelcome key={0} onNext={() => setStep(1)} />,
    <StepPreflight key={1} sdk={sdk} onNext={(r) => { setState({ ...state, preflight: r }); setStep(2); }} onBack={() => setStep(0)} />,
    <StepConsoleSpace key={2} sdk={sdk} state={state} setState={setState} onBack={() => setStep(1)} onNext={() => setStep(3)} />,
    <StepTeam key={3} sdk={sdk} state={state} setState={setState} onBack={() => setStep(2)} onNext={() => setStep(4)} />,
    <StepReview key={4} sdk={sdk} state={state} onBack={() => setStep(3)} onNext={() => setStep(5)} />,
    <StepDone key={5} sdk={sdk} state={state} />
  ];
  return (
    <Stack flexDirection="column" spacing="spacingL" padding="spacingXl">
      <Heading>Org Governance — Setup</Heading>
      {steps[step]}
    </Stack>
  );
}

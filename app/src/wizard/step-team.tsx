import React, { useState } from "react";
import { Stack, FormControl, TextInput, Button, Pill, Flex } from "@contentful/f36-components";
import type { WizardState } from "../locations/app-config";

export function StepTeam({ state, setState, onNext, onBack }:
  { sdk: any; state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void }) {
  const [member, setMember] = useState("");
  function add() {
    if (!member) return;
    setState({ ...state, initialMembers: [...state.initialMembers, member] }); setMember("");
  }
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <FormControl><FormControl.Label>Team name</FormControl.Label>
        <TextInput value={state.orgAdminsTeamName} onChange={(e) => setState({ ...state, orgAdminsTeamName: e.target.value })} />
      </FormControl>
      <FormControl><FormControl.Label>Initial members (user IDs)</FormControl.Label>
        <Flex gap="spacingS" flexWrap="wrap">{state.initialMembers.map((m, i) => <Pill key={i} label={m} />)}</Flex>
        <Flex gap="spacingS">
          <TextInput value={member} onChange={(e) => setMember(e.target.value)} placeholder="user-id" />
          <Button onClick={add}>Add</Button>
        </Flex>
      </FormControl>
      <Stack><Button onClick={onBack}>Back</Button><Button variant="primary" onClick={onNext}>Next</Button></Stack>
    </Stack>
  );
}

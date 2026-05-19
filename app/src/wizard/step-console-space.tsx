import React, { useEffect, useState } from "react";
import { Stack, Radio, TextInput, Select, FormControl, Button } from "@contentful/f36-components";
import type { WizardState } from "../locations/app-config";

export function StepConsoleSpace({ sdk, state, setState, onNext, onBack }:
  { sdk: any; state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [name, setName] = useState("governance-console");
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [pickedId, setPickedId] = useState<string>("");
  useEffect(() => {
    sdk.cma.space.getMany({}).then((r: any) => setSpaces(r.items.map((s: any) => ({ id: s.sys.id, name: s.name }))));
  }, []);
  async function next() {
    let id: string, n: string;
    if (mode === "create") {
      const created = await sdk.cma.space.create({ organizationId: sdk.ids.organization }, { name, defaultLocale: "en-US" });
      id = created.sys.id; n = created.name;
    } else { id = pickedId; n = spaces.find((s) => s.id === pickedId)?.name ?? pickedId; }
    setState({ ...state, consoleSpaceId: id, consoleSpaceName: n });
    onNext();
  }
  return (
    <Stack flexDirection="column" spacing="spacingM">
      <FormControl><FormControl.Label>Console space</FormControl.Label>
        <Radio name="mode" isChecked={mode === "create"} onChange={() => setMode("create")}>Create new space</Radio>
        {mode === "create" && <TextInput value={name} onChange={(e) => setName(e.target.value)} />}
        <Radio name="mode" isChecked={mode === "existing"} onChange={() => setMode("existing")}>Use existing space</Radio>
        {mode === "existing" && (
          <Select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
            <Select.Option value="">— pick —</Select.Option>
            {spaces.map((s) => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
          </Select>
        )}
      </FormControl>
      <Stack><Button onClick={onBack}>Back</Button><Button variant="primary" onClick={next} isDisabled={mode === "existing" && !pickedId}>Next</Button></Stack>
    </Stack>
  );
}

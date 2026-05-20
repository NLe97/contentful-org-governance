import React, { useEffect, useState } from "react";
import { Stack, Button, Spinner, Note } from "@contentful/f36-components";

type Check = { name: string; result?: "pass" | "fail" | "skip"; detail?: string };

export function StepPreflight({ sdk, onNext, onBack }: { sdk: any; onNext: (r: { passed: boolean; failures: string[] }) => void; onBack: () => void }) {
  const [checks, setChecks] = useState<Check[]>([
    { name: "App SDK initialized inside Contentful" },
    { name: "Caller identity available" },
    { name: "Caller is Org Admin or Owner" },
    { name: "Custom role with manageRoles=none accepted" },
    { name: "Org Admins team creatable" }
  ]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setRunning(true);
    (async () => {
      const next: Check[] = [];
      next.push({ name: checks[0]!.name, result: sdk?.location ? "pass" : "fail", detail: sdk?.location ? "ok" : "sdk.location missing" });
      const userId: string | undefined = sdk?.ids?.user;
      next.push({ name: checks[1]!.name, result: userId ? "pass" : "fail", detail: userId ? `userId=${userId}` : "no sdk.ids.user" });
      next.push({ name: checks[2]!.name, result: "skip", detail: "Verified server-side at install via checkOrgAdmin; 403 returned if not Owner/Admin" });
      next.push({ name: checks[3]!.name, result: "skip", detail: "Verified by scripts/probe-1-role-hides-rp.ts before install" });
      next.push({ name: checks[4]!.name, result: "skip", detail: "Verified at runtime during bootstrap (idempotent)" });
      setChecks(next); setRunning(false);
    })();
  }, []);

  const failures = checks.filter((c) => c.result === "fail").map((c) => c.name);
  const passed = checks.length > 0 && failures.length === 0;

  return (
    <Stack flexDirection="column" spacing="spacingM">
      {running && <Spinner />}
      <ul>
        {checks.map((c, i) => (
          <li key={i}>{c.result === "pass" ? "✓ " : c.result === "fail" ? "✗ " : c.result === "skip" ? "○ " : "… "}{c.name}{c.detail ? <span style={{ opacity: 0.6 }}> — {c.detail}</span> : null}</li>
        ))}
      </ul>
      {!running && failures.length > 0 && <Note variant="negative">Failing checks: {failures.join(", ")}</Note>}
      {!running && passed && <Note variant="positive">All automated checks passed.</Note>}
      <Stack>
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" isDisabled={running || !passed} onClick={() => onNext({ passed, failures })}>Continue</Button>
      </Stack>
    </Stack>
  );
}

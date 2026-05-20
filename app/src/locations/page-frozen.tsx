import React, { useEffect, useState } from "react";
import { Stack, Heading, Paragraph, Spinner } from "@contentful/f36-components";
import { api } from "../api-client";

export function PageFrozen({ sdk }: { sdk: any }) {
  const [state, setState] = useState<any>();
  useEffect(() => {
    api.getState(sdk, { spaceId: sdk.ids.space, orgId: sdk.ids.organization, consoleSpaceId: sdk.parameters.installation?.consoleSpaceId })
       .then(setState).catch(() => setState({ freezeStatus: "OFF" }));
  }, []);
  if (!state) return <Spinner />;
  if (state.freezeStatus !== "FROZEN" && state.freezeStatus !== "TRANSITIONING_ON") {
    return <Paragraph>This space is not currently frozen.</Paragraph>;
  }
  return (
    <Stack flexDirection="column" spacing="spacingL" padding="spacingXl" alignItems="center">
      <Heading style={{ fontSize: 56 }}>🔒</Heading>
      <Heading>Frozen by org policy</Heading>
      <Paragraph>Role and permission edits are disabled. Contact your org admin to request a change.</Paragraph>
    </Stack>
  );
}

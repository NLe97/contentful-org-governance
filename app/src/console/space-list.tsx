import React, { useEffect, useState } from "react";
import { Table, Spinner, Paragraph } from "@contentful/f36-components";
import { FreezeToggle } from "./freeze-toggle";
import { api } from "../api-client";

export function SpaceList({ sdk }: { sdk: any }) {
  const [spaces, setSpaces] = useState<{ id: string; name: string }[] | undefined>();
  const [error, setError] = useState<string>();
  const consoleSpaceId: string = sdk.parameters?.installation?.consoleSpaceId ?? sdk.ids.space;

  useEffect(() => {
    api.listSpaces(sdk, { orgId: sdk.ids.organization, consoleSpaceId })
      .then((r) => setSpaces(r.items.filter((s: any) => s.id !== consoleSpaceId)))
      .catch((e) => setError(e?.body ?? e?.message ?? String(e)));
  }, []);

  if (error) return <Paragraph>Could not list spaces: {error}</Paragraph>;
  if (!spaces) return <Spinner />;
  if (spaces.length === 0) {
    return (
      <Paragraph>
        No other spaces in this organization yet. The console space (<code>{consoleSpaceId}</code>) is excluded.
        Create another space in Contentful to demonstrate fan-out and freeze.
      </Paragraph>
    );
  }
  return (
    <Table>
      <Table.Head><Table.Row><Table.Cell>Space</Table.Cell><Table.Cell>Freeze</Table.Cell></Table.Row></Table.Head>
      <Table.Body>
        {spaces.map((s) => (
          <Table.Row key={s.id}><Table.Cell>{s.name}</Table.Cell><Table.Cell><FreezeToggle sdk={sdk} spaceId={s.id} /></Table.Cell></Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

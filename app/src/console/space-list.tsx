import React, { useEffect, useState } from "react";
import { Table, Stack, Spinner } from "@contentful/f36-components";
import { FreezeToggle } from "./freeze-toggle";

export function SpaceList({ sdk }: { sdk: any }) {
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    sdk.cma.space.getMany({}).then((r: any) =>
      setSpaces(r.items.map((s: any) => ({ id: s.sys.id, name: s.name }))
        .filter((s: any) => s.id !== sdk.parameters.installation?.consoleSpaceId))
    );
  }, []);
  if (!spaces.length) return <Spinner />;
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

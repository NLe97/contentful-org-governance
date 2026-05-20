import React, { useEffect, useState } from "react";
import { Table, Spinner } from "@contentful/f36-components";

export function AuditLog({ sdk }: { sdk: any }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const env = await (await sdk.cma.space.get({ spaceId: sdk.parameters.installation?.consoleSpaceId }) as any).getEnvironment("master");
      const r = await env.getEntries({ content_type: "auditEvent", order: "-fields.timestamp", limit: 50 });
      setRows(r.items);
    })();
  }, []);
  if (!rows.length) return <Spinner />;
  return (
    <Table>
      <Table.Head><Table.Row><Table.Cell>When</Table.Cell><Table.Cell>Type</Table.Cell><Table.Cell>Space</Table.Cell><Table.Cell>Actor</Table.Cell></Table.Row></Table.Head>
      <Table.Body>
        {rows.map((r) => (
          <Table.Row key={r.sys.id}>
            <Table.Cell>{r.fields.timestamp?.["en-US"]}</Table.Cell>
            <Table.Cell>{r.fields.eventType?.["en-US"]}</Table.Cell>
            <Table.Cell>{r.fields.spaceId?.["en-US"]}</Table.Cell>
            <Table.Cell>{r.fields.actorUserId?.["en-US"]}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

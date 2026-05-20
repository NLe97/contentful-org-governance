import React, { useEffect, useState } from "react";
import { Table, Spinner, Paragraph } from "@contentful/f36-components";

export function AuditLog({ sdk }: { sdk: any }) {
  const [rows, setRows] = useState<any[] | undefined>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    // The audit-event entries live in this install space, so we can use
    // the (scoped) App SDK directly to fetch them.
    (async () => {
      try {
        const r = await sdk.cma.entry.getMany({
          query: { content_type: "auditEvent", order: "-fields.timestamp", limit: 50 }
        });
        setRows(r.items);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []);

  if (error) return <Paragraph>Could not load audit log: {error}</Paragraph>;
  if (!rows) return <Spinner />;
  if (rows.length === 0) return <Paragraph>No audit events yet.</Paragraph>;
  return (
    <Table>
      <Table.Head><Table.Row><Table.Cell>When</Table.Cell><Table.Cell>Type</Table.Cell><Table.Cell>Space</Table.Cell><Table.Cell>Actor</Table.Cell></Table.Row></Table.Head>
      <Table.Body>
        {rows.map((r) => (
          <Table.Row key={r.sys.id}>
            <Table.Cell>{r.fields.timestamp?.["en-US"]}</Table.Cell>
            <Table.Cell>{r.fields.eventType?.["en-US"]}</Table.Cell>
            <Table.Cell>{r.fields.spaceId?.["en-US"] ?? "—"}</Table.Cell>
            <Table.Cell>{r.fields.actorUserId?.["en-US"] ?? "—"}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

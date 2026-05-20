// Read the raw request body as a UTF-8 string. Required for signed-request
// verification because Vercel's default bodyParser produces a parsed object,
// and JSON.stringify(parsed) does not necessarily match the bytes Contentful
// hashed when signing.

import type { IncomingMessage } from "node:http";

export async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString("utf8");
}

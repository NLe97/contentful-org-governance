// Read the raw request body as a UTF-8 string. Required for signed-request
// verification because Vercel's default bodyParser produces a parsed object,
// and JSON.stringify(parsed) does not necessarily match the bytes Contentful
// hashed when signing.
//
// In production we disable bodyParser per endpoint (`export const config = { api:
// { bodyParser: false } }`), so `req` is a raw `IncomingMessage` stream. In
// unit tests the mock `req` already has `body` set (an object or string), so
// we fall back to that path.

export async function readRawBody(req: any): Promise<string> {
  if (typeof req?.body === "string") return req.body;
  if (req?.body !== undefined && req?.body !== null) {
    return JSON.stringify(req.body);
  }
  if (req && typeof req[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return "";
}

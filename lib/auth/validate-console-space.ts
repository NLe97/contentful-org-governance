// Defense in depth: every signed iframe request carries a `consoleSpaceId`
// query/body parameter, but the iframe itself runs inside whatever space the
// user installed the app in. If the app is installed in multiple spaces, each
// installation passes ITS OWN spaceId as `consoleSpaceId` — letting state +
// audit writes land in the wrong place.
//
// Pin the canonical console-space-ID via env var CONSOLE_SPACE_ID set during
// deploy. The validator rejects any request whose `consoleSpaceId` does not
// match. If CONSOLE_SPACE_ID is unset (e.g., during initial setup or a
// legacy deployment), validation is skipped — bootstrap is still possible.

export class ConsoleSpaceMismatchError extends Error {
  constructor(expected: string, got: string) {
    super(`consoleSpaceId mismatch: expected '${expected}', got '${got}'`);
    this.name = "ConsoleSpaceMismatchError";
  }
}

export function validateConsoleSpace(consoleSpaceId: string): void {
  const pinned = process.env.CONSOLE_SPACE_ID;
  if (!pinned) return;
  if (consoleSpaceId !== pinned) throw new ConsoleSpaceMismatchError(pinned, consoleSpaceId);
}

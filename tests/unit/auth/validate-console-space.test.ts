import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateConsoleSpace, ConsoleSpaceMismatchError } from "@/lib/auth/validate-console-space";

describe("validateConsoleSpace", () => {
  const ORIG = process.env.CONSOLE_SPACE_ID;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.CONSOLE_SPACE_ID;
    else process.env.CONSOLE_SPACE_ID = ORIG;
  });

  it("is a no-op when CONSOLE_SPACE_ID env is unset", () => {
    delete process.env.CONSOLE_SPACE_ID;
    expect(() => validateConsoleSpace("anything")).not.toThrow();
  });

  it("accepts a matching consoleSpaceId", () => {
    process.env.CONSOLE_SPACE_ID = "spc-real";
    expect(() => validateConsoleSpace("spc-real")).not.toThrow();
  });

  it("throws ConsoleSpaceMismatchError on mismatch", () => {
    process.env.CONSOLE_SPACE_ID = "spc-real";
    expect(() => validateConsoleSpace("spc-fake")).toThrow(ConsoleSpaceMismatchError);
  });
});

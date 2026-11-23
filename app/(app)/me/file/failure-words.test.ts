import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import {
  type CodeKey,
  codeKey,
  type FailureKey,
  failureKey,
} from "./failure-words";
import type { CodeFailure, FileActionFailure } from "./file-types";

/*
 * Every refusal of the worker's own file (profile H5a) in words of its own,
 * in both languages: a Record over each union, so a refusal added to the
 * types fails here until it is given words. A bank code that didn't go says
 * so, never "not saved".
 */

const FILE_WORDS: Record<FileActionFailure, FailureKey> = {
  off: "off",
  own: "failed",
  ownerOnly: "failed",
  noAccess: "failed",
  ack: "failed",
  demo: "demo",
  closed: "closed",
  stepUp: "stepUp",
  phoneHold: "phoneHold",
  shredded: "keys",
  notStaff: "off",
  invalid: "invalid",
  moved: "failed",
  notInTeam: "off",
  keys: "keys",
  unavailable: "keys",
  failed: "failed",
  viewOnly: "viewOnly",
  businessChanged: "businessChanged",
};

/** A send's refusals, and a check's: null is the file's words. */
const CODE_WORDS: Record<
  CodeFailure | FileActionFailure,
  { send: CodeKey | null; confirm: CodeKey | null }
> = {
  wrongCode: { send: "wrongCode", confirm: "wrongCode" },
  tooMany: { send: "tooMany", confirm: "tooMany" },
  rateLimit: { send: "rateLimit", confirm: "rateLimit" },
  captcha: { send: "captcha", confirm: "captcha" },
  noPhone: { send: "noPhone", confirm: "noPhone" },
  invalidPhone: { send: "noPhone", confirm: "noPhone" },
  failed: { send: "failed", confirm: null },
  off: { send: null, confirm: null },
  own: { send: null, confirm: null },
  ownerOnly: { send: null, confirm: null },
  noAccess: { send: null, confirm: null },
  ack: { send: null, confirm: null },
  demo: { send: null, confirm: null },
  closed: { send: null, confirm: null },
  stepUp: { send: null, confirm: null },
  phoneHold: { send: null, confirm: null },
  shredded: { send: null, confirm: null },
  notStaff: { send: null, confirm: null },
  invalid: { send: null, confirm: null },
  moved: { send: null, confirm: null },
  notInTeam: { send: null, confirm: null },
  keys: { send: null, confirm: null },
  unavailable: { send: null, confirm: null },
  viewOnly: { send: null, confirm: null },
  businessChanged: { send: null, confirm: null },
};

describe("the file's refusals in words", () => {
  it.each(Object.entries(FILE_WORDS))("says %s as %s", (failure, key) => {
    expect(failureKey(failure as FileActionFailure)).toBe(key);
    expect(he.app.file.failures[key]).toBeTruthy();
    expect(en.app.file.failures[key]).toBeTruthy();
  });

  it.each(Object.entries(CODE_WORDS))(
    "says a code's %s when sending and when checking",
    (failure, expected) => {
      const which = failure as CodeFailure | FileActionFailure;
      expect(codeKey(which, "send")).toBe(expected.send);
      expect(codeKey(which, "confirm")).toBe(expected.confirm);
      for (const key of [expected.send, expected.confirm]) {
        if (key === null) continue;
        expect(he.app.file.bank.code[key]).toBeTruthy();
        expect(en.app.file.bank.code[key]).toBeTruthy();
      }
    },
  );

  it("says a code that didn't go as such, and not as something unsaved", () => {
    expect(codeKey("failed", "send")).toBe("failed");
    expect(he.app.file.bank.code.failed).not.toBe(he.app.file.failures.failed);
    expect(en.app.file.bank.code.failed).not.toBe(en.app.file.failures.failed);
  });
});

import { describe, expect, it } from "vitest";
import { FILE_GROUPS, type FileRow } from "./employee-file";
import {
  FILE_STEPS,
  type FileParts,
  type FileStepInput,
  fileParts,
  fileStepOf,
  fileStepStates,
  fileStepsOn,
  isNewFile,
  minorOnFile,
  nextFileStep,
  pensionDue,
  phoneTail,
  previousFileStep,
  resumeStep,
  SENT_WITH,
  STEP_OF_GROUP,
  sendBlocker,
  stepsDone,
} from "./employee-file-steps";

const EMPTY: FileStepInput = {
  addressForm: null,
  asked: FILE_GROUPS,
  missing: FILE_GROUPS,
  directGroups: [],
  pensionAnswer: null,
  form101: null,
  contactHeld: false,
};

const row: FileRow = {
  legal_first_name: null,
  legal_last_name: null,
  birth_date: null,
  id_kind: null,
  id_country: null,
  id_expires_on: null,
  id_hint: null,
  city_code: null,
  bank_code: null,
  bank_branch: null,
  bank_account_hint: null,
  bank_holder_kind: null,
  bank_instruction_at: null,
  bank_instruction_version: null,
  bank_changed_at: null,
  bank_review: null,
  pension_answer: null,
  pension_fund: null,
  pension_answered_at: null,
  direct_groups: [],
  submitted_at: null,
  updated_at: "2026-11-20T10:00:00+00:00",
  has: {
    id: false,
    address: false,
    email: false,
    work_language: false,
    bank_account: false,
  },
};

describe("the steps", () => {
  it("are the start, a step for each group, then Form 101", () => {
    expect(FILE_STEPS).toEqual([
      "start",
      "identity",
      "address",
      "bank",
      "pension",
      "form101",
    ]);
    for (const group of FILE_GROUPS) {
      expect(FILE_STEPS).toContain(STEP_OF_GROUP[group]);
    }
  });

  it("read a step's name from the page, and nothing else", () => {
    expect(fileStepOf("bank")).toBe("bank");
    expect(fileStepOf("Bank")).toBeNull();
    expect(fileStepOf(["bank"])).toBeNull();
    expect(fileStepOf(undefined)).toBeNull();
  });

  it("go forward and back in order", () => {
    expect(nextFileStep("start")).toBe("identity");
    expect(nextFileStep("form101")).toBeNull();
    expect(previousFileStep("identity")).toBe("start");
    expect(previousFileStep("start")).toBeNull();
  });
});

describe("fileStepStates", () => {
  it("has everything open in a new file", () => {
    const states = fileStepStates(EMPTY);
    expect(Object.values(states).every((state) => state === "open")).toBe(true);
    expect(stepsDone(states)).toBe(0);
    expect(resumeStep(states)).toBe("start");
  });

  it("picks up at the first step still open", () => {
    const states = fileStepStates({
      ...EMPTY,
      addressForm: "f",
      missing: ["bank", "pension"],
    });
    expect(states).toMatchObject({
      start: "done",
      identity: "done",
      address: "done",
      bank: "open",
    });
    expect(resumeStep(states)).toBe("bank");
    expect(stepsDone(states)).toBe(3);
  });

  it("counts a group handed directly as behind the person, in its own words", () => {
    const states = fileStepStates({
      ...EMPTY,
      addressForm: "x",
      missing: ["bank"],
      directGroups: ["pension"],
    });
    expect(states.pension).toBe("direct");
    expect(states.bank).toBe("open");
    expect(stepsDone(states)).toBe(4);
  });

  it("takes 'later' as an answer here, though the file still counts it missing", () => {
    const states = fileStepStates({
      ...EMPTY,
      missing: ["pension"],
      pensionAnswer: "later",
    });
    expect(states.pension).toBe("done");
  });

  it("asks only what the business asks", () => {
    const states = fileStepStates({
      ...EMPTY,
      asked: ["identity", "pension"],
      missing: ["identity", "pension"],
    });
    // Step 2 without the address is only the ways to reach the person:
    // optional, with nothing of it in yet.
    expect(states.address).toBe("optional");
    expect(states.bank).toBe("done");
    expect(states.identity).toBe("open");
  });

  it("has Form 101 done once handed in, and open again when returned or due", () => {
    const form = (
      status: "handed_in" | "accepted" | "returned" | "change_due",
    ) =>
      fileStepStates({ ...EMPTY, form101: { status, route: "print" } }).form101;
    expect(form("handed_in")).toBe("done");
    expect(form("accepted")).toBe("done");
    expect(form("returned")).toBe("open");
    expect(form("change_due")).toBe("open");
    expect(
      fileStepStates({
        ...EMPTY,
        form101: { status: "handed_in", route: "direct" },
      }).form101,
    ).toBe("direct");
  });

  it("is done when nothing is open", () => {
    const states = fileStepStates({
      ...EMPTY,
      addressForm: "m",
      missing: [],
      form101: { status: "accepted", route: "print" },
    });
    expect(resumeStep(states)).toBe("done");
    expect(stepsDone(states)).toBe(FILE_STEPS.length);
  });
});

describe("sendBlocker", () => {
  it("keeps an empty file back, at its first detail", () => {
    expect(sendBlocker(fileStepStates(EMPTY))).toBe("identity");
  });

  it("names the first of the details still open", () => {
    const states = fileStepStates({
      ...EMPTY,
      addressForm: "f",
      missing: ["bank", "pension"],
    });
    expect(sendBlocker(states)).toBe("bank");
  });

  it("lets the file go without step 0 or Form 101", () => {
    const states = fileStepStates({ ...EMPTY, missing: [] });
    expect(states.start).toBe("open");
    expect(states.form101).toBe("open");
    expect(sendBlocker(states)).toBeNull();
  });

  it("takes 'later', a group handed directly and one not asked as done", () => {
    expect(
      sendBlocker(
        fileStepStates({
          ...EMPTY,
          asked: ["identity", "address", "pension"],
          missing: ["pension", "address"],
          directGroups: ["address"],
          pensionAnswer: "later",
        }),
      ),
    ).toBeNull();
  });

  it("are the four details, in the steps' order", () => {
    expect(SENT_WITH).toEqual(
      FILE_STEPS.filter((step) => SENT_WITH.some((sent) => sent === step)),
    );
    expect(SENT_WITH).toEqual(FILE_GROUPS.map((group) => STEP_OF_GROUP[group]));
  });
});

describe("isNewFile", () => {
  it("is new with no row, or one that holds nothing", () => {
    expect(isNewFile(null)).toBe(true);
    expect(isNewFile(row)).toBe(true);
  });

  it("is not new once anything is in it", () => {
    expect(isNewFile({ ...row, legal_first_name: "נועה" })).toBe(false);
    expect(isNewFile({ ...row, birth_date: "1995-01-01" })).toBe(false);
    expect(isNewFile({ ...row, direct_groups: ["bank"] })).toBe(false);
    expect(isNewFile({ ...row, pension_answer: "later" })).toBe(false);
    expect(isNewFile({ ...row, has: { ...row.has, bank_account: true } })).toBe(
      false,
    );
  });
});

describe("minorOnFile", () => {
  it("is a minor until the 18th birthday, and not on it", () => {
    expect(minorOnFile("2010-11-22", "2026-11-22")).toBe(true);
    expect(minorOnFile("2008-11-23", "2026-11-22")).toBe(true);
    expect(minorOnFile("2008-11-22", "2026-11-22")).toBe(false);
    expect(minorOnFile(null, "2026-11-22")).toBe(false);
  });

  it("turns 18 on 28 February for someone born on 29 February", () => {
    expect(minorOnFile("2008-02-29", "2026-02-27")).toBe(true);
    expect(minorOnFile("2008-02-29", "2026-02-28")).toBe(false);
  });
});

describe("pensionDue", () => {
  it("is open through its last day, then passed", () => {
    expect(pensionDue("2026-11-22", "2026-11-22")).toEqual({
      kind: "open",
      dueOn: "2026-11-22",
    });
    expect(pensionDue("2026-11-21", "2026-11-22")).toEqual({ kind: "passed" });
    expect(pensionDue(null, "2026-11-22")).toEqual({ kind: "none" });
  });
});

describe("phoneTail", () => {
  it("is the last four digits of the number, and nothing more", () => {
    expect(phoneTail("+972500000003")).toBe("0003");
    expect(phoneTail(null)).toBeNull();
    expect(phoneTail("+97")).toBeNull();
  });
});

describe("the steps by the business's settings", () => {
  const NOTHING_HELD = {
    address: false,
    email: false,
    bank: false,
    workLanguage: false,
    emergency: false,
  };
  const ALL = {
    address: true,
    bank: true,
    emergencyContact: false,
    workLanguage: false,
  };
  const LEAN = { ...ALL, address: false, bank: false };
  const on = (
    asks: typeof ALL,
    held: Partial<typeof NOTHING_HELD> = {},
    way: "print" | "link" | "off" = "print",
  ): FileParts => fileParts({ asks, way, held: { ...NOTHING_HELD, ...held } });

  it("are all six while everything is asked", () => {
    expect(fileStepsOn(on(ALL))).toEqual(FILE_STEPS);
  });

  it("leave out the address and the bank when neither is asked nor held", () => {
    expect(fileStepsOn(on(LEAN))).toEqual([
      "start",
      "identity",
      "pension",
      "form101",
    ]);
  });

  it("keep step 2 for the ways to reach the person alone", () => {
    const parts = on({ ...LEAN, emergencyContact: true, workLanguage: true });
    expect(parts).toMatchObject({
      address: false,
      workLanguage: true,
      emergency: true,
    });
    expect(fileStepsOn(parts)).toEqual([
      "start",
      "identity",
      "address",
      "pension",
      "form101",
    ]);
    // An email in the file keeps it too, to change or delete.
    expect(fileStepsOn(on(LEAN, { email: true }))).toContain("address");
  });

  it("keep what the file holds though it isn't asked any more", () => {
    expect(fileStepsOn(on({ ...ALL, bank: false }, { bank: true }))).toEqual(
      FILE_STEPS,
    );
    expect(fileStepsOn(on({ ...ALL, bank: false }))).not.toContain("bank");
  });

  it("leave out Form 101 when it isn't taken in the app", () => {
    expect(fileStepsOn(on(ALL, {}, "off"))).toEqual([
      "start",
      "identity",
      "address",
      "bank",
      "pension",
    ]);
  });

  it("go forward, back and on over the steps on screen", () => {
    const lean = fileStepsOn(on(LEAN, {}, "off"));
    expect(lean).toEqual(["start", "identity", "pension"]);
    expect(nextFileStep("identity", lean)).toBe("pension");
    expect(nextFileStep("pension", lean)).toBeNull();
    expect(previousFileStep("pension", lean)).toBe("identity");
    // From a step that isn't on screen, to the nearest one that is.
    expect(nextFileStep("address", lean)).toBe("pension");
    expect(fileStepOf("bank", lean)).toBeNull();
    expect(fileStepOf("pension", lean)).toBe("pension");
    const states = fileStepStates({
      ...EMPTY,
      addressForm: "f",
      asked: ["identity", "pension"],
      missing: ["pension"],
    });
    expect(resumeStep(states, lean)).toBe("pension");
    expect(sendBlocker(states, lean)).toBe("pension");
    expect(stepsDone(states, lean)).toBe(2);
    expect(resumeStep({ ...states, pension: "done" }, lean)).toBe("done");
  });

  it("has step 2 optional while the address isn't asked and nothing of it is in", () => {
    const lean = { ...EMPTY, asked: ["identity", "pension"] as const };
    const states = fileStepStates({ ...lean, missing: ["identity"] });
    expect(states.address).toBe("optional");
    // Counted as behind the person, never where they pick up, never a blocker.
    const steps = ["start", "identity", "address", "pension"] as const;
    expect(stepsDone({ ...states, start: "done" }, steps)).toBe(3);
    expect(resumeStep({ ...states, start: "done" }, steps)).toBe("identity");
    expect(sendBlocker({ ...states, identity: "done" }, steps)).toBeNull();
    expect(
      fileStepStates({ ...lean, missing: [], contactHeld: true }).address,
    ).toBe("done");
    // Asked, it is the address as before.
    expect(fileStepStates({ ...EMPTY, contactHeld: true }).address).toBe(
      "open",
    );
  });
});

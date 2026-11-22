import { describe, expect, it } from "vitest";
import { FILE_GROUPS, type FileRow } from "./employee-file";
import {
  FILE_STEPS,
  type FileStepInput,
  fileStepOf,
  fileStepStates,
  isNewFile,
  minorOnFile,
  nextFileStep,
  pensionDue,
  phoneTail,
  previousFileStep,
  resumeStep,
  STEP_OF_GROUP,
  stepsDone,
} from "./employee-file-steps";

const EMPTY: FileStepInput = {
  addressForm: null,
  asked: FILE_GROUPS,
  missing: FILE_GROUPS,
  directGroups: [],
  pensionAnswer: null,
  form101: null,
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
    expect(states.address).toBe("done");
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

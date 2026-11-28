import { describe, expect, it } from "vitest";
import type { ClockEditor, HoursFixer } from "./ask-fix";
import type { Department } from "./departments";
import { helpers, helpOf, TEAM_HELP_ROLES } from "./help";
import { ROLES, type Role } from "./modules";

// "עזרה" on /me (closing the pilot, PR 15): a worker asks whoever corrects
// hours (PR 8's choice), else an owner, also with the clock off; a manager,
// the accountant and an owner ask an owner, never themself; owners,
// managers and the accountant also reach ConceptApp's team where the
// deployment names its number, never in a demo business, and nothing at all
// while viewing as someone.

const WORKER = "00000000-0000-4000-a000-000000000003";
const OWNER: ClockEditor = {
  id: "00000000-0000-4000-a000-000000000001",
  role: "owner",
  name: "אורי",
};
const SECOND_OWNER: ClockEditor = {
  id: "00000000-0000-4000-a000-000000000007",
  role: "owner",
  name: "בתיה",
};
const SHIRAN: ClockEditor = {
  id: "00000000-0000-4000-a000-000000000002",
  role: "manager",
  name: "שירן",
};
const DANA: ClockEditor = {
  id: "00000000-0000-4000-a000-000000000004",
  role: "manager",
  name: "דנה",
};
// A worker given clock.edit of their own.
const GIL: ClockEditor = {
  id: "00000000-0000-4000-a000-000000000005",
  role: "worker",
  name: "גיל",
};
const ACCOUNTANT = "00000000-0000-4000-a000-000000000008";

function department(name: string, members: string[]): Department {
  return { id: `d-${name}`, key: `k-${name}`, name, archivedAt: null, members };
}

const names = (fixers: readonly HoursFixer[]) => fixers.map((f) => f.name);

/** `helpers` for `role`, with chat open and no departments unless given. */
const asked = (
  role: Role,
  person: string,
  {
    editors = [],
    owners = [OWNER],
    departments = [],
    chat = true,
  }: {
    editors?: ClockEditor[];
    owners?: ClockEditor[];
    departments?: Department[];
    chat?: boolean;
  } = {},
) => helpers({ role, person, editors, owners, departments, chat });

describe("helpers", () => {
  it("offers a worker whoever may edit the clock, not the owner, as the clock does", () => {
    expect(
      names(asked("worker", WORKER, { editors: [OWNER, SHIRAN] })),
    ).toEqual(["שירן"]);
  });

  it("offers a worker the one in their department first among several", () => {
    const fixers = asked("worker", WORKER, {
      editors: [OWNER, SHIRAN, DANA],
      departments: [
        department("מחסן", [WORKER, SHIRAN.id]),
        department("קבלה", [DANA.id]),
      ],
    });
    expect(names(fixers)).toEqual(["שירן", "דנה"]);
    expect(fixers[0]?.near).toBe(true);
    expect(fixers[0]?.departments).toEqual(["מחסן"]);
  });

  it("offers a worker the owner when only owners may edit the clock", () => {
    expect(names(asked("worker", WORKER, { editors: [OWNER] }))).toEqual([
      "אורי",
    ]);
  });

  it("offers a worker the owners when the clock names nobody (it is off, or not in the project yet)", () => {
    expect(names(asked("worker", WORKER, { editors: [] }))).toEqual(["אורי"]);
    expect(
      names(
        asked("worker", WORKER, {
          editors: [],
          owners: [SECOND_OWNER, OWNER],
        }),
      ),
    ).toEqual(["אורי", "בתיה"]);
  });

  it("never offers someone the owners list holds by mistake who isn't an owner", () => {
    expect(
      names(asked("worker", WORKER, { editors: [], owners: [OWNER, SHIRAN] })),
    ).toEqual(["אורי"]);
  });

  it("offers a worker who may edit the clock the others, never themself", () => {
    expect(
      names(asked("worker", GIL.id, { editors: [OWNER, SHIRAN, GIL] })),
    ).toEqual(["שירן"]);
    expect(names(asked("worker", GIL.id, { editors: [OWNER, GIL] }))).toEqual([
      "אורי",
    ]);
  });

  it("offers a manager the owner, never another manager or a worker who may edit the clock", () => {
    const editors = [OWNER, SHIRAN, DANA, GIL];
    expect(names(asked("manager", SHIRAN.id, { editors }))).toEqual(["אורי"]);
    // With the clock off too.
    expect(names(asked("manager", SHIRAN.id))).toEqual(["אורי"]);
  });

  it("offers the accountant the owner, named only: they are in no chat", () => {
    const fixers = asked("accountant", ACCOUNTANT, {
      editors: [OWNER, SHIRAN],
      chat: false,
    });
    expect(names(fixers)).toEqual(["אורי"]);
    expect(fixers[0]?.chat).toBe(false);
  });

  it("offers an owner another owner, and an owner alone nobody", () => {
    expect(
      names(
        asked("owner", OWNER.id, {
          editors: [OWNER, SHIRAN],
          owners: [OWNER, SECOND_OWNER],
        }),
      ),
    ).toEqual(["בתיה"]);
    expect(asked("owner", OWNER.id, { editors: [OWNER, SHIRAN] })).toEqual([]);
  });

  it("names whom to ask with chat off, and leaves out someone neither written to nor named", () => {
    const nameless: ClockEditor = { ...SHIRAN, name: null };
    const fixers = asked("worker", WORKER, {
      editors: [OWNER, nameless],
      chat: false,
    });
    // Shiran can be neither written to nor named, so the owner comes.
    expect(names(fixers)).toEqual(["אורי"]);
    expect(fixers[0]?.chat).toBe(false);
  });
});

describe("helpOf", () => {
  const owner = asked("worker", WORKER, { editors: [OWNER] });
  const two = asked("worker", WORKER, { editors: [OWNER, SHIRAN, DANA] });
  const named = asked("worker", WORKER, { editors: [OWNER], chat: false });
  const base = { viewing: false, demo: false, support: false };

  it("offers a worker whom to ask, never ConceptApp's team, with the setting or without", () => {
    for (const support of [false, true]) {
      expect(
        helpOf({ ...base, support, role: "worker", fixers: owner }),
      ).toEqual({
        ask: { kind: "write", person: owner[0] },
        team: false,
      });
    }
    expect(helpOf({ ...base, role: "worker", fixers: two })?.ask?.kind).toBe(
      "pick",
    );
    expect(helpOf({ ...base, role: "worker", fixers: named })?.ask).toEqual({
      kind: "name",
      people: named,
    });
  });

  it("offers an owner, a manager and the accountant ConceptApp's team too, only with the setting", () => {
    expect([...TEAM_HELP_ROLES].sort()).toEqual(
      ROLES.filter((role) => role !== "worker").sort(),
    );
    for (const role of TEAM_HELP_ROLES) {
      expect(helpOf({ ...base, support: true, role, fixers: owner })).toEqual({
        ask: { kind: "write", person: owner[0] },
        team: true,
      });
      // With no setting, only whom to ask in the business.
      expect(helpOf({ ...base, role, fixers: owner })).toEqual({
        ask: { kind: "write", person: owner[0] },
        team: false,
      });
      // Nobody to ask (an owner alone): ConceptApp's team alone, or nothing.
      expect(helpOf({ ...base, support: true, role, fixers: [] })).toEqual({
        ask: null,
        team: true,
      });
      expect(helpOf({ ...base, role, fixers: [] })).toBeNull();
    }
  });

  it("never offers ConceptApp's team in a demo business, whom to ask still", () => {
    for (const role of ROLES) {
      const help = helpOf({
        ...base,
        demo: true,
        support: true,
        role,
        fixers: owner,
      });
      expect(help?.team, role).toBe(false);
      expect(help?.ask?.kind, role).toBe("write");
      expect(
        helpOf({ ...base, demo: true, support: true, role, fixers: [] }),
        role,
      ).toBeNull();
    }
  });

  it("offers nothing while viewing as someone", () => {
    for (const role of ROLES) {
      expect(
        helpOf({ ...base, viewing: true, support: true, role, fixers: two }),
        role,
      ).toBeNull();
    }
  });

  it("offers a worker with nobody to ask nothing at all", () => {
    expect(
      helpOf({ ...base, support: true, role: "worker", fixers: [] }),
    ).toBeNull();
  });
});

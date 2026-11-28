import { describe, expect, it } from "vitest";
import {
  type AskFix,
  askFixOf,
  type ClockEditor,
  type HoursFixer,
  hoursFixers,
} from "./ask-fix";
import type { Department } from "./departments";
import type { PunchFailure } from "./time-clock";
import { asksForFix, FIX_FAILURES } from "./time-clock-format";

// Who a worker asks to correct their hours (closing the pilot, PR 8): those
// who may edit the clock, never the worker; the owners only when nobody else
// may; those in the worker's departments first; written to in chat, or only
// named with chat off.

const WORKER = "00000000-0000-4000-a000-000000000003";
const OWNER: ClockEditor = {
  id: "00000000-0000-4000-a000-000000000001",
  role: "owner",
  name: "אורי",
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
const NAMELESS: ClockEditor = {
  id: "00000000-0000-4000-a000-000000000006",
  role: "manager",
  name: null,
};

function department(
  name: string,
  members: string[],
  archivedAt: string | null = null,
): Department {
  return { id: `d-${name}`, key: `k-${name}`, name, archivedAt, members };
}

const ids = (fixers: readonly HoursFixer[]) => fixers.map((f) => f.name);

describe("hoursFixers", () => {
  it("offers the one person other than the owners who may edit the clock", () => {
    const fixers = hoursFixers({
      editors: [OWNER, SHIRAN],
      person: WORKER,
      departments: [],
      chat: true,
    });
    expect(fixers).toEqual([
      { ...SHIRAN, departments: [], near: false, chat: true },
    ]);
    expect(askFixOf(fixers)).toEqual<AskFix>({
      kind: "write",
      person: fixers[0] as HoursFixer,
    });
  });

  it("offers several to pick from, those in the worker's departments first, each by name", () => {
    const fixers = hoursFixers({
      editors: [OWNER, SHIRAN, DANA, GIL],
      person: WORKER,
      departments: [
        department("מחסן", [WORKER, SHIRAN.id]),
        department("קופה", [DANA.id, GIL.id]),
      ],
      chat: true,
    });
    // Shiran shares the storeroom; Gil and Dana don't, by name (ג before ד).
    expect(ids(fixers)).toEqual(["שירן", "גיל", "דנה"]);
    expect(fixers.map((f) => f.near)).toEqual([true, false, false]);
    expect(fixers.map((f) => f.departments)).toEqual([
      ["מחסן"],
      ["קופה"],
      ["קופה"],
    ]);
    expect(askFixOf(fixers)?.kind).toBe("pick");
  });

  it("counts only live departments, for nearness and for the line", () => {
    const fixers = hoursFixers({
      editors: [SHIRAN, DANA],
      person: WORKER,
      departments: [
        department("בר", [WORKER, DANA.id], "2026-11-01T10:00:00Z"),
        department("אולם", [SHIRAN.id]),
      ],
      chat: true,
    });
    expect(ids(fixers)).toEqual(["דנה", "שירן"]);
    expect(fixers.every((f) => !f.near)).toBe(true);
    expect(fixers.find((f) => f.id === DANA.id)?.departments).toEqual([]);
  });

  it("offers the owner when only owners may edit the clock", () => {
    const fixers = hoursFixers({
      editors: [OWNER],
      person: WORKER,
      departments: [],
      chat: true,
    });
    expect(ids(fixers)).toEqual(["אורי"]);
    expect(askFixOf(fixers)?.kind).toBe("write");
  });

  it("offers every owner to pick from when there are several and nobody else", () => {
    const partner: ClockEditor = {
      id: "00000000-0000-4000-a000-000000000007",
      role: "owner",
      name: "אביב",
    };
    const fixers = hoursFixers({
      editors: [OWNER, partner],
      person: WORKER,
      departments: [],
      chat: true,
    });
    expect(ids(fixers)).toEqual(["אביב", "אורי"]);
    expect(askFixOf(fixers)?.kind).toBe("pick");
  });

  it("never offers the worker themself, whatever the case of their id", () => {
    // Gil holds clock.edit of his own; the owner is the one left to ask.
    const fixers = hoursFixers({
      editors: [OWNER, GIL],
      person: GIL.id.toUpperCase(),
      departments: [],
      chat: true,
    });
    expect(ids(fixers)).toEqual(["אורי"]);
    // A sole owner asks nobody.
    expect(
      hoursFixers({
        editors: [OWNER],
        person: OWNER.id,
        departments: [],
        chat: true,
      }),
    ).toEqual([]);
  });

  it("names them with chat off, leaving out who has no name", () => {
    const fixers = hoursFixers({
      editors: [OWNER, SHIRAN, NAMELESS],
      person: WORKER,
      departments: [],
      chat: false,
    });
    expect(ids(fixers)).toEqual(["שירן"]);
    expect(fixers[0]?.chat).toBe(false);
    expect(askFixOf(fixers)).toEqual<AskFix>({
      kind: "name",
      people: fixers,
    });
  });

  it("names the owners with chat off when nobody else has a name to say", () => {
    const fixers = hoursFixers({
      editors: [OWNER, NAMELESS],
      person: WORKER,
      departments: [],
      chat: false,
    });
    expect(ids(fixers)).toEqual(["אורי"]);
    expect(askFixOf(fixers)?.kind).toBe("name");
  });

  it("keeps someone with no name in chat, after those with one", () => {
    const fixers = hoursFixers({
      editors: [NAMELESS, SHIRAN],
      person: WORKER,
      departments: [],
      chat: true,
    });
    expect(ids(fixers)).toEqual(["שירן", null]);
  });

  it("writes to nobody off the staff, and names them instead", () => {
    const books: ClockEditor = {
      id: "00000000-0000-4000-a000-000000000008",
      role: "accountant",
      name: "גלית",
    };
    const fixers = hoursFixers({
      editors: [OWNER, books],
      person: WORKER,
      departments: [],
      chat: true,
    });
    expect(fixers).toEqual([
      { ...books, departments: [], near: false, chat: false },
    ]);
    expect(askFixOf(fixers)?.kind).toBe("name");
  });

  it("offers each person once", () => {
    const fixers = hoursFixers({
      editors: [SHIRAN, { ...SHIRAN, id: SHIRAN.id.toUpperCase() }],
      person: WORKER,
      departments: [],
      chat: true,
    });
    expect(fixers).toHaveLength(1);
  });
});

describe("askFixOf", () => {
  it("is nothing for nobody", () => {
    expect(askFixOf([])).toBeNull();
  });

  it("picks among several when only some are written to in chat", () => {
    const fixers = hoursFixers({
      editors: [
        SHIRAN,
        {
          id: "00000000-0000-4000-a000-000000000009",
          role: "accountant",
          name: "גלית",
        },
      ],
      person: WORKER,
      departments: [],
      chat: true,
    });
    const ask = askFixOf(fixers);
    expect(ask?.kind).toBe("pick");
    expect(
      ask?.kind === "pick" ? ask.people.map((p) => [p.name, p.chat]) : [],
    ).toEqual([
      ["גלית", false],
      ["שירן", true],
    ]);
  });
});

describe("the refusals that say to ask whoever approves hours", () => {
  it("are a shift open too long, a clock-out too old to take back and times that meet another shift", () => {
    // Each one a refusal the clock can say (tsc checks the assignment).
    const refusals: readonly PunchFailure[] = FIX_FAILURES;
    expect([...refusals]).toEqual(["tooLong", "tooLate", "times"]);
    for (const failure of FIX_FAILURES) expect(asksForFix(failure)).toBe(true);
  });

  it("are not the others, nor no refusal at all", () => {
    for (const failure of ["alreadyIn", "notIn", "failed", "noAccess"]) {
      expect(asksForFix(failure)).toBe(false);
    }
    expect(asksForFix(null)).toBe(false);
  });
});

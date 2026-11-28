import { describe, expect, it } from "vitest";
import { NO_TEAM_PROGRESS, teamProgress } from "./first-steps";
import { MODULE_KEYS, ROLES, type Role } from "./modules";
import {
  clockCodeState,
  countsInSetup,
  hasStaff,
  isSetupStaff,
  SETUP_ITEM_MODULE,
  SETUP_ITEMS,
  SETUP_STAFF_ROLES,
  type SetupFacts,
  type SetupItem,
  type SetupPersonStatus,
  setupChecklist,
  setupCounted,
  setupDone,
  setupPay,
  setupRemaining,
  setupTeam,
  storedShabbatAnswer,
} from "./setup";
import type { InviteState } from "./team";

const none = { owner: 0, manager: 0, worker: 0 };

/** A business with its modules off: the four items it always had, and joining. */
const bare: SetupFacts = {
  people: none,
  hasAddress: false,
  team: NO_TEAM_PROGRESS,
  scheduling: null,
  timeClock: null,
  pay: null,
};

/**
 * A business of any kind just opened from the general template: scheduling
 * and the time clock on with nothing set, the Shabbat question never asked,
 * nobody in it, pay seen by the owners and accountants alone.
 */
const fresh: SetupFacts = {
  ...bare,
  scheduling: {
    positions: 0,
    patterns: 0,
    published: false,
    closedOnShabbat: null,
  },
  timeClock: { requirePunchCode: false, codeDisplay: "both", stations: 0 },
  pay: { roles: [], personal: 0 },
};

/** The same business with everything done. */
const ready: SetupFacts = {
  people: { owner: 1, manager: 1, worker: 3 },
  hasAddress: true,
  team: { joined: 3, invited: 1, expired: 0, pending: 0 },
  scheduling: {
    positions: 2,
    patterns: 3,
    published: true,
    closedOnShabbat: false,
  },
  timeClock: { requirePunchCode: true, codeDisplay: "both", stations: 1 },
  pay: { roles: ["manager"], personal: 1 },
};

/** The item of that key, as its own kind. */
const item = <K extends SetupItem["key"]>(
  items: readonly SetupItem[],
  key: K,
): (SetupItem & { key: K }) | undefined =>
  items.find((i): i is SetupItem & { key: K } => i.key === key);

const open = (items: readonly SetupItem[]) =>
  items.filter((i) => !i.done).map((i) => i.key);

describe("setupChecklist", () => {
  it("leaves everything but the opening for a bare business", () => {
    const items = setupChecklist(bare);
    expect(items).toEqual([
      { key: "opened", done: true },
      { key: "owner", done: false },
      { key: "staff", done: false },
      { key: "address", done: false },
      { key: "joined", done: false, team: NO_TEAM_PROGRESS },
    ]);
    expect(setupRemaining(items)).toBe(4);
  });

  it("counts an owner apart from the rest of the staff", () => {
    const ownerOnly = setupChecklist({
      ...bare,
      people: { ...none, owner: 1 },
      hasAddress: true,
    });
    expect(open(ownerOnly)).toEqual(["staff", "joined"]);
    const staffOnly = setupChecklist({
      ...bare,
      people: { ...none, manager: 1 },
      hasAddress: true,
    });
    expect(open(staffOnly)).toEqual(["owner", "joined"]);
  });

  it("shows a fresh business from the general template what is missing, in order", () => {
    const items = setupChecklist(fresh);
    expect(items.map((i) => i.key)).toEqual(SETUP_ITEMS);
    expect(open(items)).toEqual([
      "owner",
      "staff",
      "address",
      "shabbat",
      "shifts",
      "clockCode",
      "joined",
      "publish",
    ]);
    expect(item(items, "shabbat")).toEqual({
      key: "shabbat",
      done: false,
      answer: null,
    });
    expect(item(items, "shifts")).toEqual({
      key: "shifts",
      done: false,
      positions: 0,
      patterns: 0,
    });
    expect(item(items, "clockCode")).toEqual({
      key: "clockCode",
      done: false,
      code: "off",
      stations: 0,
    });
    // Owners and accountants alone see pay: shown, done, never counted.
    expect(item(items, "pay")).toEqual({
      key: "pay",
      done: true,
      roles: [],
      personal: 0,
    });
    // The clock's code off and who sees pay are never counted.
    expect(setupCounted(items)).toBe(8);
    expect(setupDone(items)).toBe(1);
    expect(setupRemaining(items)).toBe(7);
  });

  it("is complete once everything is done", () => {
    const items = setupChecklist(ready);
    expect(items.map((i) => i.key)).toEqual(SETUP_ITEMS);
    expect(open(items)).toEqual([]);
    expect(setupRemaining(items)).toBe(0);
    expect(setupDone(items)).toBe(setupCounted(items));
    expect(item(items, "shabbat")?.answer).toBe("open");
    expect(item(items, "pay")).toMatchObject({
      roles: ["manager"],
      personal: 1,
    });
    expect(item(items, "joined")?.team).toEqual(ready.team);
  });

  it("offers each module's items only while it is on", () => {
    const noScheduling = setupChecklist({ ...ready, scheduling: null });
    expect(noScheduling.map((i) => i.key)).toEqual(
      SETUP_ITEMS.filter((key) => SETUP_ITEM_MODULE[key] !== "scheduling"),
    );
    const noClock = setupChecklist({ ...ready, timeClock: null });
    expect(noClock.map((i) => i.key)).toEqual(
      SETUP_ITEMS.filter((key) => key !== "clockCode"),
    );
    const noPay = setupChecklist({ ...ready, pay: null });
    expect(noPay.map((i) => i.key)).toEqual(
      SETUP_ITEMS.filter((key) => key !== "pay"),
    );
    // Each item names a module that exists, or none.
    for (const key of SETUP_ITEMS) {
      const module = SETUP_ITEM_MODULE[key];
      if (module !== null) expect(MODULE_KEYS).toContain(module);
    }
  });

  it("says Shabbat was answered by what is stored, either way", () => {
    const answer = (closedOnShabbat: boolean | null) =>
      item(
        setupChecklist({
          ...ready,
          scheduling: {
            positions: 1,
            patterns: 1,
            published: true,
            closedOnShabbat,
          },
        }),
        "shabbat",
      );
    expect(answer(true)).toEqual({
      key: "shabbat",
      done: true,
      answer: "closed",
    });
    expect(answer(false)).toEqual({
      key: "shabbat",
      done: true,
      answer: "open",
    });
    // Opened before the wizard asked: closed by default, and never asked.
    expect(answer(null)).toEqual({
      key: "shabbat",
      done: false,
      answer: null,
    });
  });

  it("wants both job roles and regular shifts", () => {
    const shifts = (positions: number, patterns: number) =>
      item(
        setupChecklist({
          ...ready,
          scheduling: {
            positions,
            patterns,
            published: false,
            closedOnShabbat: true,
          },
        }),
        "shifts",
      )?.done;
    expect(shifts(0, 0)).toBe(false);
    expect(shifts(2, 0)).toBe(false);
    expect(shifts(0, 3)).toBe(false);
    expect(shifts(1, 1)).toBe(true);
  });

  it("asks for the first week published", () => {
    const published = (value: boolean) =>
      item(
        setupChecklist({
          ...ready,
          scheduling: {
            positions: 1,
            patterns: 1,
            published: value,
            closedOnShabbat: true,
          },
        }),
        "publish",
      );
    expect(published(false)).toEqual({ key: "publish", done: false });
    expect(published(true)).toEqual({ key: "publish", done: true });
  });

  it("is joined once one of the staff joined, whoever is still waiting", () => {
    const joined = (team: SetupFacts["team"]) =>
      item(setupChecklist({ ...ready, team }), "joined")?.done;
    expect(joined(NO_TEAM_PROGRESS)).toBe(false);
    expect(joined({ joined: 0, invited: 3, expired: 1, pending: 2 })).toBe(
      false,
    );
    expect(joined({ joined: 1, invited: 0, expired: 0, pending: 0 })).toBe(
      true,
    );
    expect(joined({ joined: 1, invited: 2, expired: 1, pending: 5 })).toBe(
      true,
    );
  });

  it("counts the clock's code only when it is on where nobody sees it", () => {
    const clock = (
      requirePunchCode: boolean,
      codeDisplay: "station" | "manager" | "both",
      stations: number,
    ) => {
      const items = setupChecklist({
        ...ready,
        timeClock: { requirePunchCode, codeDisplay, stations },
      });
      const code = item(items, "clockCode");
      return {
        code: code?.code,
        done: code?.done,
        counted: code ? countsInSetup(code) : null,
        left: setupRemaining(items),
      };
    };
    expect(clock(false, "both", 2)).toEqual({
      code: "off",
      done: false,
      counted: false,
      left: 0,
    });
    expect(clock(true, "manager", 0)).toEqual({
      code: "phone",
      done: true,
      counted: false,
      left: 0,
    });
    expect(clock(true, "both", 2)).toEqual({
      code: "both",
      done: true,
      counted: false,
      left: 0,
    });
    expect(clock(true, "station", 1)).toEqual({
      code: "station",
      done: true,
      counted: false,
      left: 0,
    });
    // Shown only at a station, and none runs: nobody can see the code.
    expect(clock(true, "station", 0)).toEqual({
      code: "noStation",
      done: false,
      counted: true,
      left: 1,
    });
  });
});

describe("clockCodeState", () => {
  const state = (
    requirePunchCode: boolean,
    codeDisplay: "station" | "manager" | "both",
    stations: number,
  ) => clockCodeState({ requirePunchCode, codeDisplay, stations });

  it("reads the code, where it is shown and the stations running", () => {
    expect(state(false, "station", 0)).toBe("off");
    expect(state(false, "both", 3)).toBe("off");
    expect(state(true, "manager", 3)).toBe("phone");
    // With no station running, "both" is the phone's alone.
    expect(state(true, "both", 0)).toBe("phone");
    expect(state(true, "both", 1)).toBe("both");
    expect(state(true, "station", 2)).toBe("station");
    expect(state(true, "station", 0)).toBe("noStation");
  });
});

describe("storedShabbatAnswer", () => {
  it("is the stored answer, before any default", () => {
    expect(storedShabbatAnswer({ closedOnShabbat: true })).toBe(true);
    expect(storedShabbatAnswer({ closedOnShabbat: false, positions: [] })).toBe(
      false,
    );
  });

  it("is null where nothing answered it", () => {
    // The general template's own settings, as it opens a business.
    expect(storedShabbatAnswer({})).toBeNull();
    expect(storedShabbatAnswer({ positions: [], shifts: [] })).toBeNull();
    expect(storedShabbatAnswer(null)).toBeNull();
    expect(storedShabbatAnswer(undefined)).toBeNull();
    expect(storedShabbatAnswer("closed")).toBeNull();
    expect(storedShabbatAnswer([true])).toBeNull();
    expect(storedShabbatAnswer({ closedOnShabbat: null })).toBeNull();
    expect(storedShabbatAnswer({ closedOnShabbat: "true" })).toBeNull();
  });
});

describe("setupTeam", () => {
  const person = (role: Role, status: SetupPersonStatus) => ({ role, status });

  it("counts the staff who joined, were sent a link or ran out, and everyone without a link", () => {
    expect(setupTeam([])).toEqual(NO_TEAM_PROGRESS);
    expect(
      setupTeam([
        person("owner", "member"),
        person("manager", "member"),
        person("worker", "member"),
        person("worker", "invited"),
        person("worker", "expired"),
        person("worker", "pending"),
        person("worker", "pending"),
        // Never counted as staff, but still waiting for a link.
        person("owner", "pending"),
        person("accountant", "pending"),
        person("accountant", "member"),
        person("owner", "invited"),
        person("owner", "expired"),
      ]),
    ).toEqual({ joined: 2, invited: 1, expired: 1, pending: 4 });
  });

  it("says what the owner's first steps say for the same people", () => {
    const state: Record<Exclude<SetupPersonStatus, "member">, InviteState> = {
      invited: "open",
      pending: "pending",
      expired: "expired",
    };
    const statuses: SetupPersonStatus[] = [
      "member",
      "invited",
      "pending",
      "expired",
    ];
    const people = ROLES.flatMap((role) =>
      statuses.map((status) => person(role, status)),
    );
    // Every role in every state, and each pair of them.
    for (const [index, one] of people.entries()) {
      for (const other of people.slice(index)) {
        const pair = [one, other];
        expect(setupTeam(pair)).toEqual(
          teamProgress({
            members: pair
              .filter((p) => p.status === "member")
              .map((p, i) => ({
                userId: `u${i}`,
                name: null,
                phone: null,
                role: p.role,
                photo: null,
                addressForm: null,
              })),
            invites: pair.flatMap((p, i) =>
              p.status === "member"
                ? []
                : [
                    {
                      id: `i${i}`,
                      name: null,
                      phone: "+972500000000",
                      role: p.role,
                      expiresAt: "2026-12-01T00:00:00.000Z",
                      state: state[p.status],
                    },
                  ],
            ),
          }),
        );
      }
    }
  });
});

describe("setupPay", () => {
  const person = (
    role: Role,
    personal: boolean,
    namedRole: { id: string } | null = null,
  ) => ({ role, personal, namedRole });

  it("is the owners and accountants alone in a business that gave it to nobody", () => {
    expect(setupPay([], [])).toEqual({ roles: [], personal: 0 });
    expect(
      setupPay([], [person("owner", false), person("accountant", false)]),
    ).toEqual({ roles: [], personal: 0 });
  });

  it("counts those given it on their own, never twice", () => {
    expect(
      setupPay(
        ["manager"],
        [
          person("owner", true),
          person("accountant", true),
          // Their role gives it already.
          person("manager", true),
          person("manager", false),
          person("worker", true),
          person("worker", false),
          // A role the business named never gives it: on their own.
          person("manager", true, { id: "shift-lead" }),
        ],
      ),
    ).toEqual({ roles: ["manager"], personal: 2 });
    expect(
      setupPay(
        ["manager", "worker"],
        [person("worker", true), person("manager", true)],
      ),
    ).toEqual({ roles: ["manager", "worker"], personal: 0 });
  });
});

describe("hasStaff", () => {
  it("counts managers and workers, never owners or accountants", () => {
    expect(SETUP_STAFF_ROLES).toEqual(["manager", "worker"]);
    expect(ROLES.filter(isSetupStaff)).toEqual(["manager", "worker"]);
    expect(hasStaff({ manager: 0, worker: 0 })).toBe(false);
    expect(hasStaff({ manager: 1, worker: 0 })).toBe(true);
    expect(hasStaff({ manager: 0, worker: 2 })).toBe(true);
  });

  it("is what the checklist's staff item says", () => {
    for (const people of [
      none,
      { ...none, owner: 2 },
      { ...none, manager: 1 },
      { ...none, worker: 1 },
    ]) {
      const staff = item(setupChecklist({ ...bare, people }), "staff");
      expect(staff?.done).toBe(hasStaff(people));
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  FIRST_STEP_KEYS,
  FIRST_STEP_MODULE,
  FIRST_STEPS_HIDDEN_COOKIE,
  FIRST_STEPS_HIDDEN_MOST,
  type FirstStep,
  type FirstStepsFacts,
  firstStepHref,
  firstSteps,
  firstStepsHidden,
  isOptionalStep,
  nextStep,
  stepsCounted,
  stepsDone,
  stepsLeft,
  teamProgress,
  withFirstStepsHidden,
} from "./first-steps";
import type { Role } from "./modules";
import { BUILDER_PATH } from "./running-week";
import { buildTeam, type TeamInvite, type TeamMember } from "./team";

const NOW = new Date("2026-11-18T09:00:00.000Z");

/** A business of any kind on its first day: the owner alone, nothing set. */
const dayOne: FirstStepsFacts = {
  team: { joined: 0, invited: 0, expired: 0 },
  details: { address: null, cityMissing: true },
  scheduling: { positions: 0, patterns: 0, published: false },
  lists: { departments: 0, empty: 0 },
  timeClock: { requirePunchCode: false },
};

const keys = (steps: readonly FirstStep[]) => steps.map((step) => step.key);
const step = <K extends FirstStep["key"]>(
  steps: readonly FirstStep[],
  key: K,
) => steps.find((s): s is Extract<FirstStep, { key: K }> => s.key === key);

const member = (userId: string, role: Role): TeamMember => ({
  userId,
  name: userId,
  phone: null,
  role,
  photo: null,
  addressForm: null,
});
const invite = (id: string, role: Role, open: boolean): TeamInvite => ({
  id,
  name: id,
  phone: "+972500000000",
  role,
  expiresAt: open ? "2026-11-25T09:00:00.000Z" : "2026-11-10T09:00:00.000Z",
});

describe("firstSteps", () => {
  it("leaves a new business's owner everything to do, the team first", () => {
    const steps = firstSteps(dayOne);
    expect(keys(steps)).toEqual([
      "team",
      "shifts",
      "publish",
      "details",
      "clockCode",
    ]);
    expect(stepsCounted(steps)).toBe(4);
    expect(stepsDone(steps)).toBe(0);
    expect(stepsLeft(steps)).toBe(4);
    expect(nextStep(steps)?.key).toBe("team");
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("offers a module's steps only while it is on", () => {
    const off: Record<string, Partial<FirstStepsFacts>> = {
      scheduling: { scheduling: null },
      lists: { lists: null },
      time_clock: { timeClock: null },
    };
    const withDepartments = { ...dayOne, lists: { departments: 2, empty: 1 } };
    const all = keys(firstSteps(withDepartments));
    expect(all).toEqual([...FIRST_STEP_KEYS]);
    for (const [module, facts] of Object.entries(off)) {
      expect(keys(firstSteps({ ...withDepartments, ...facts }))).toEqual(
        all.filter((key) => FIRST_STEP_MODULE[key] !== module),
      );
    }
    // The business's own steps stay with every module off.
    expect(
      keys(
        firstSteps({
          ...dayOne,
          scheduling: null,
          lists: null,
          timeClock: null,
        }),
      ),
    ).toEqual(["team", "details"]);
  });

  it("counts the team done once one of the staff joined", () => {
    const team = (members: TeamMember[], invites: TeamInvite[]) => {
      const steps = firstSteps({
        ...dayOne,
        team: teamProgress(buildTeam(members, invites, NOW)),
      });
      const found = step(steps, "team");
      if (!found) throw new Error("no team step");
      return { ...found, href: firstStepHref(found) };
    };
    const owner = member("owner", "owner");

    const nobody = team([owner], []);
    expect(nobody.done).toBe(false);
    expect(nobody.href).toBe("/team/invite");

    const invited = team([owner], [invite("noa", "worker", true)]);
    expect(invited).toMatchObject({
      done: false,
      progress: { joined: 0, invited: 1, expired: 0 },
      href: "/team",
    });

    const expired = team([owner], [invite("noa", "worker", false)]);
    expect(expired).toMatchObject({
      done: false,
      progress: { joined: 0, invited: 0, expired: 1 },
      href: "/team",
    });

    const joined = team(
      [owner, member("noa", "worker")],
      [invite("dan", "manager", true)],
    );
    expect(joined).toMatchObject({
      done: true,
      progress: { joined: 1, invited: 1, expired: 0 },
      href: "/team",
    });

    // Another owner and an accountant, joined or invited, aren't the staff.
    const outside = team(
      [owner, member("partner", "owner"), member("books", "accountant")],
      [invite("co", "owner", true), invite("office", "accountant", true)],
    );
    expect(outside).toMatchObject({
      done: false,
      progress: { joined: 0, invited: 0, expired: 0 },
      href: "/team/invite",
    });
  });

  it("asks for job roles and regular shifts both", () => {
    const shifts = (positions: number, patterns: number) =>
      step(
        firstSteps({
          ...dayOne,
          scheduling: { positions, patterns, published: false },
        }),
        "shifts",
      );
    expect(shifts(0, 0)).toMatchObject({ done: false });
    expect(shifts(3, 0)).toMatchObject({
      done: false,
      positions: 3,
      patterns: 0,
    });
    expect(shifts(0, 2)).toMatchObject({ done: false });
    expect(shifts(4, 3)).toMatchObject({
      done: true,
      positions: 4,
      patterns: 3,
    });
  });

  it("asks for people in every department, once there are departments", () => {
    const departments = (count: number, empty: number) =>
      step(
        firstSteps({ ...dayOne, lists: { departments: count, empty } }),
        "departments",
      );
    expect(departments(0, 0)).toBeUndefined();
    expect(departments(3, 1)).toMatchObject({
      done: false,
      departments: 3,
      empty: 1,
    });
    expect(departments(3, 0)).toMatchObject({ done: true, departments: 3 });
  });

  it("is published once any week was", () => {
    const publish = (published: boolean) =>
      step(
        firstSteps({
          ...dayOne,
          scheduling: { positions: 1, patterns: 1, published },
        }),
        "publish",
      );
    expect(publish(false)?.done).toBe(false);
    expect(publish(true)?.done).toBe(true);
  });

  it("asks for the address, and the city only where Shabbat closes it", () => {
    const details = (address: string | null, cityMissing: boolean) =>
      step(
        firstSteps({ ...dayOne, details: { address, cityMissing } }),
        "details",
      );
    expect(details(null, true)).toMatchObject({ done: false, missing: "both" });
    expect(details("  ", true)).toMatchObject({
      done: false,
      missing: "both",
      address: null,
    });
    expect(details(null, false)).toMatchObject({
      done: false,
      missing: "address",
    });
    expect(details("הרצל 1", true)).toMatchObject({
      done: false,
      missing: "city",
      address: "הרצל 1",
    });
    expect(details("הרצל 1", false)).toMatchObject({
      done: true,
      missing: null,
      address: "הרצל 1",
    });
  });

  it("never counts the clock's code, done or not", () => {
    const everything: FirstStepsFacts = {
      team: { joined: 2, invited: 0, expired: 0 },
      details: { address: "הרצל 1", cityMissing: false },
      scheduling: { positions: 2, patterns: 1, published: true },
      lists: { departments: 2, empty: 0 },
      timeClock: { requirePunchCode: false },
    };
    const open = firstSteps(everything);
    expect(step(open, "clockCode")?.done).toBe(false);
    expect(isOptionalStep({ key: "clockCode" })).toBe(true);
    expect(stepsCounted(open)).toBe(5);
    expect(stepsLeft(open)).toBe(0);
    expect(nextStep(open)).toBeNull();

    const withCode = firstSteps({
      ...everything,
      timeClock: { requirePunchCode: true },
    });
    expect(step(withCode, "clockCode")?.done).toBe(true);
    expect(stepsDone(withCode)).toBe(5);
    expect(stepsCounted(withCode)).toBe(5);

    // Something undone later is left again, after the steps before it.
    const emptied = firstSteps({
      ...everything,
      lists: { departments: 2, empty: 1 },
    });
    expect(stepsLeft(emptied)).toBe(1);
    expect(nextStep(emptied)?.key).toBe("departments");
  });

  it("leads each step to the screen that does it", () => {
    const steps = firstSteps({
      ...dayOne,
      team: { joined: 1, invited: 0, expired: 0 },
      lists: { departments: 1, empty: 1 },
    });
    expect(keys(steps)).toEqual([...FIRST_STEP_KEYS]);
    expect(
      Object.fromEntries(steps.map((s) => [s.key, firstStepHref(s)])),
    ).toEqual({
      team: "/team",
      shifts: "/manage/scheduling",
      departments: "/manage/departments",
      publish: BUILDER_PATH,
      details: "/manage/business",
      clockCode: "/manage/time_clock",
    });
    for (const key of FIRST_STEP_KEYS) {
      expect(key in FIRST_STEP_MODULE).toBe(true);
    }
  });
});

describe("hiding the first steps", () => {
  const A = "00000000-0000-4000-b000-0000000000aa";
  const B = "00000000-0000-4000-b000-0000000000bb";

  it("is kept in its own cookie", () => {
    expect(FIRST_STEPS_HIDDEN_COOKIE).toBe("ca_first_steps_hidden");
  });

  it("hides only the businesses it names", () => {
    expect(firstStepsHidden(undefined, A)).toBe(false);
    expect(firstStepsHidden("", A)).toBe(false);
    expect(firstStepsHidden(A, A)).toBe(true);
    expect(firstStepsHidden(A, B)).toBe(false);
    expect(firstStepsHidden(`${A}0`, A)).toBe(false);
    expect(firstStepsHidden(`${B},${A}`, A)).toBe(true);
  });

  it("adds a business once, the latest last, and keeps the newest", () => {
    expect(withFirstStepsHidden(undefined, A)).toBe(A);
    expect(withFirstStepsHidden(A, B)).toBe(`${A},${B}`);
    expect(withFirstStepsHidden(`${A},${B}`, A)).toBe(`${B},${A}`);
    const many = Array.from({ length: FIRST_STEPS_HIDDEN_MOST }, (_, i) =>
      `${i}`.padStart(2, "0"),
    ).join(",");
    const kept = withFirstStepsHidden(many, A).split(",");
    expect(kept).toHaveLength(FIRST_STEPS_HIDDEN_MOST);
    expect(kept[0]).toBe("01");
    expect(kept.at(-1)).toBe(A);
  });
});

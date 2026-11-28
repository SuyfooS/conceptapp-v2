import type { ModuleRow } from "@domain/modules";
import { beforeEach, describe, expect, it, vi } from "vitest";

// What the console's checklist reads from a business's modules (closing the
// pilot, PR 16), with the secret-key reads in @db stood in for: each read
// only while its module is on, the clock's stations only while its code is,
// and who sees pay only where the page may show it. Shabbat is the answer
// stored, before the manifest's default.

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  hasPublishedWeekForTeam: vi.fn(),
  countClockStationsForTeam: vi.fn(),
  getPayAccessForTeam: vi.fn(),
}));
vi.mock("@db/schedule", () => ({
  hasPublishedWeekForTeam: mocks.hasPublishedWeekForTeam,
}));
vi.mock("@db/clock-stations", () => ({
  countClockStationsForTeam: mocks.countClockStationsForTeam,
}));
vi.mock("@db/payroll", () => ({
  getPayAccessForTeam: mocks.getPayAccessForTeam,
}));

const { setupModuleFacts } = await import("./setup-facts");

const BUSINESS = "11111111-1111-4111-a111-111111111111";

/** The general template's rows as it opens a business: settings empty. */
const general: ModuleRow[] = [
  { key: "scheduling", enabled: true, settings: {} },
  { key: "time_clock", enabled: true, settings: {} },
  { key: "chat", enabled: false, settings: {} },
];

const person = (role: string, personal: boolean) => ({
  userId: `${role}-${personal}`,
  name: null,
  photo: null,
  role,
  namedRole: null,
  personal,
});

beforeEach(() => {
  mocks.hasPublishedWeekForTeam.mockReset().mockResolvedValue(false);
  mocks.countClockStationsForTeam.mockReset().mockResolvedValue(0);
  mocks.getPayAccessForTeam
    .mockReset()
    .mockResolvedValue({ roles: [], people: [] });
});

describe("setupModuleFacts", () => {
  it("reads a fresh general business as nothing set and Shabbat never asked", async () => {
    expect(await setupModuleFacts(BUSINESS, general, true)).toEqual({
      scheduling: {
        positions: 0,
        patterns: 0,
        published: false,
        closedOnShabbat: null,
      },
      timeClock: { requirePunchCode: false, codeDisplay: "both", stations: 0 },
      pay: { roles: [], personal: 0 },
    });
    expect(mocks.hasPublishedWeekForTeam).toHaveBeenCalledWith(BUSINESS);
    // The code is off, so no station shows it.
    expect(mocks.countClockStationsForTeam).not.toHaveBeenCalled();
    expect(mocks.getPayAccessForTeam).toHaveBeenCalledWith(BUSINESS);
  });

  it("reads what the business holds", async () => {
    mocks.hasPublishedWeekForTeam.mockResolvedValue(true);
    mocks.countClockStationsForTeam.mockResolvedValue(2);
    mocks.getPayAccessForTeam.mockResolvedValue({
      roles: ["manager"],
      people: [
        person("owner", false),
        person("manager", true),
        person("worker", true),
        person("worker", false),
      ],
    });
    const rows: ModuleRow[] = [
      {
        key: "scheduling",
        enabled: true,
        settings: {
          closedOnShabbat: false,
          positions: [
            { key: "front", name: "Front desk" },
            { key: "back", name: "Back office" },
          ],
          shifts: [
            {
              key: "morning",
              name: "Morning",
              days: [0, 1, 2, 3, 4],
              start: "09:00",
              end: "16:00",
              needed: 1,
            },
          ],
        },
      },
      {
        key: "time_clock",
        enabled: true,
        settings: { requirePunchCode: true, codeDisplay: "station" },
      },
    ];
    expect(await setupModuleFacts(BUSINESS, rows, true)).toEqual({
      scheduling: {
        positions: 2,
        patterns: 1,
        published: true,
        closedOnShabbat: false,
      },
      timeClock: {
        requirePunchCode: true,
        codeDisplay: "station",
        stations: 2,
      },
      // The manager sees it by role; the worker on their own.
      pay: { roles: ["manager"], personal: 1 },
    });
    expect(mocks.countClockStationsForTeam).toHaveBeenCalledWith(BUSINESS);
  });

  it("says closed on Shabbat only where it was answered so", async () => {
    const rows = (settings: unknown): ModuleRow[] => [
      { key: "scheduling", enabled: true, settings },
    ];
    const answer = async (settings: unknown) =>
      (await setupModuleFacts(BUSINESS, rows(settings), false)).scheduling
        ?.closedOnShabbat;
    expect(await answer({ closedOnShabbat: true })).toBe(true);
    expect(await answer({ closedOnShabbat: false })).toBe(false);
    // The manifest closes it by default; nobody answered.
    expect(await answer({})).toBeNull();
    expect(await answer(null)).toBeNull();
  });

  it("reads nothing of a module that is off", async () => {
    const off: ModuleRow[] = [
      { key: "scheduling", enabled: false, settings: { positions: [] } },
      { key: "time_clock", enabled: false, settings: {} },
    ];
    expect(await setupModuleFacts(BUSINESS, off, false)).toEqual({
      scheduling: null,
      timeClock: null,
      pay: null,
    });
    expect(await setupModuleFacts(BUSINESS, [], false)).toEqual({
      scheduling: null,
      timeClock: null,
      pay: null,
    });
    expect(mocks.hasPublishedWeekForTeam).not.toHaveBeenCalled();
    expect(mocks.countClockStationsForTeam).not.toHaveBeenCalled();
    expect(mocks.getPayAccessForTeam).not.toHaveBeenCalled();
  });

  it("reads who sees pay only where the page may show it", async () => {
    const facts = await setupModuleFacts(BUSINESS, general, false);
    expect(facts.pay).toBeNull();
    expect(mocks.getPayAccessForTeam).not.toHaveBeenCalled();
  });
});

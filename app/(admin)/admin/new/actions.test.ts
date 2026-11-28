import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import he from "@/messages/he.json";

// The new-business wizard's last step (inviting from a list, part 6), with
// what it reads and writes stood in for: the team member signed in, the
// other-staff check, the opening and the settings in @db, the app's words
// for the roles and the redirect. The staff list is read as the form reads
// it (a header row, an ID column, the app's words), only its people reach
// the database, a number on another staff sends the list back named before
// anything is written, and nothing with a number is logged. The answer
// about Shabbat (closing the pilot, PR 3) is saved once the business is
// open, through the settings engine, even when it is the template's.

const mocks = vi.hoisted(() => ({
  getPlatformStaff: vi.fn(),
  createBusiness: vi.fn(),
  onAnotherStaff: vi.fn(),
  getBusinessModulesForTeam: vi.fn(),
  setModuleSettings: vi.fn(),
}));
vi.mock("@db/admin", () => ({
  getPlatformStaff: mocks.getPlatformStaff,
  createBusiness: mocks.createBusiness,
}));
vi.mock("@db/invites", () => ({ onAnotherStaff: mocks.onAnotherStaff }));
vi.mock("@db/module-settings", () => ({
  getBusinessModulesForTeam: mocks.getBusinessModulesForTeam,
  setModuleSettings: mocks.setModuleSettings,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => {
    if (namespace !== "app.roles") throw new Error(`Unexpected ${namespace}`);
    return (key: keyof typeof he.app.roles) => he.app.roles[key];
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

const { createBusinessAction } = await import("./actions");

const STAFF = "00000000-0000-4000-a000-000000000005";
const BUSINESS = "11111111-1111-4111-a111-111111111111";

const formOf = (staff: string, shabbat: string | null = "closed") => {
  const form = new FormData();
  form.set("template", "retail");
  form.set("name", "חנות בדיקה");
  form.set("slug", "test-shop");
  form.set("address", "");
  if (shabbat !== null) form.set("shabbat", shabbat);
  form.set("accent", "#0f766e");
  form.set("staff", staff);
  return form;
};

const OPENED = "redirect /admin/businesses/test-shop?created=1";
const UNSAVED = `${OPENED}&shabbat=unsaved`;

/** Where the action went (the redirect stood in for throws it), whole. */
async function wentTo(form: FormData): Promise<string> {
  try {
    await createBusinessAction({}, form);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("The action went nowhere");
}

/** The business's module rows as its template wrote them. */
const rowsWith = (scheduling: Record<string, unknown>) => [
  { key: "scheduling", enabled: true, settings: scheduling },
  { key: "time_clock", enabled: true, settings: {} },
];

/** A shop's sheet, header row and ID column included, and the app's words for two roles. */
const SHEET = [
  "שם\tת.ז.\tנייד\tתפקיד",
  "רונית כהן\t123456782\t050-000-6501\tבעלים",
  "שי לוי\t234567891\t500006502\tניהול",
  "גלית אברהם\t\t050-000-6503\tהנהלת חשבונות",
  "תמר פרץ\t345678912\t050-000-6504\tצוות",
].join("\n");

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.getPlatformStaff
    .mockReset()
    .mockResolvedValue({ userId: STAFF, role: "onboarder" });
  mocks.createBusiness
    .mockReset()
    .mockResolvedValue({ ok: true, id: BUSINESS });
  mocks.onAnotherStaff.mockReset().mockResolvedValue([]);
  // Every template leaves Shabbat to the manifest: closed.
  mocks.getBusinessModulesForTeam
    .mockReset()
    .mockResolvedValue(rowsWith({ positions: [] }));
  mocks.setModuleSettings.mockReset().mockResolvedValue({ ok: true });
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logged.mockRestore();
});

describe("createBusinessAction", () => {
  it("reads the sheet as the form does and invites only its people", async () => {
    expect(await wentTo(formOf(SHEET))).toBe(OPENED);
    const staff = [
      { name: "רונית כהן", phone: "+972500006501", role: "owner" },
      { name: "שי לוי", phone: "+972500006502", role: "manager" },
      { name: "גלית אברהם", phone: "+972500006503", role: "accountant" },
      { name: "תמר פרץ", phone: "+972500006504", role: "worker" },
    ];
    expect(mocks.onAnotherStaff).toHaveBeenCalledWith(STAFF, staff);
    expect(mocks.createBusiness).toHaveBeenCalledWith(STAFF, {
      template: "retail",
      name: "חנות בדיקה",
      slug: "test-shop",
      address: null,
      closedOnShabbat: true,
      accent: "#0f766e",
      staff,
    });
    // No ID number of the sheet reaches the database.
    expect(JSON.stringify(mocks.createBusiness.mock.calls)).not.toMatch(
      /123456782|234567891|345678912/,
    );
  });

  it("sends the list back with the numbers on another staff, writing nothing", async () => {
    mocks.onAnotherStaff.mockResolvedValue(["+972500006502"]);
    await expect(createBusinessAction({}, formOf(SHEET))).resolves.toEqual({
      errors: { staff: "elsewhere" },
      elsewhere: ["+972500006502"],
    });
    expect(mocks.createBusiness).not.toHaveBeenCalled();
  });

  it("never asks the database about a list with a line to fix", async () => {
    await expect(
      createBusinessAction({}, formOf(`${SHEET}\nבלי מספר\t\t\t`)),
    ).resolves.toEqual({ errors: { staff: "invalid" } });
    await expect(
      createBusinessAction(
        {},
        formOf("שם\tנייד\tטלפון נייד\nדנה\t050-000-6501\t052-000-6501"),
      ),
    ).resolves.toEqual({ errors: { staff: "phoneColumns" } });
    expect(mocks.onAnotherStaff).not.toHaveBeenCalled();
    expect(mocks.createBusiness).not.toHaveBeenCalled();
  });

  it("asks nothing of someone who may not open a business", async () => {
    mocks.getPlatformStaff.mockResolvedValue(null);
    await expect(createBusinessAction({}, formOf(SHEET))).resolves.toEqual({
      failure: "noPermission",
    });
    expect(mocks.onAnotherStaff).not.toHaveBeenCalled();
  });

  it("logs a failure's message alone, with no number", async () => {
    mocks.onAnotherStaff.mockRejectedValue(
      new Error("Could not ask about other staffs: Platform staff only"),
    );
    await expect(createBusinessAction({}, formOf(SHEET))).resolves.toEqual({
      failure: "failed",
    });
    expect(mocks.createBusiness).not.toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/\d{7}/);
  });
});

describe("the answer about Shabbat", () => {
  it("saves a business open on Shabbat through the settings engine", async () => {
    expect(await wentTo(formOf(SHEET, "open"))).toBe(OPENED);
    // Read after the opening, as the console's settings page reads it.
    expect(mocks.getBusinessModulesForTeam).toHaveBeenCalledWith(BUSINESS);
    expect(mocks.createBusiness.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      mocks.getBusinessModulesForTeam.mock.invocationCallOrder[0] ?? 0,
    );
    // set_module_settings writes the change's line in the audit log.
    expect(mocks.setModuleSettings).toHaveBeenCalledTimes(1);
    expect(mocks.setModuleSettings).toHaveBeenCalledWith(
      STAFF,
      BUSINESS,
      "scheduling",
      { closedOnShabbat: false },
    );
  });

  it("saves a business closed on Shabbat where its template opens", async () => {
    mocks.getBusinessModulesForTeam.mockResolvedValue(
      rowsWith({ closedOnShabbat: false }),
    );
    expect(await wentTo(formOf(SHEET, "closed"))).toBe(OPENED);
    expect(mocks.setModuleSettings).toHaveBeenCalledWith(
      STAFF,
      BUSINESS,
      "scheduling",
      { closedOnShabbat: true },
    );
  });

  it("saves the answer when it is the template's too, so it reads as answered", async () => {
    // The manifest's default, which every template leaves in place.
    expect(await wentTo(formOf(SHEET, "closed"))).toBe(OPENED);
    mocks.getBusinessModulesForTeam.mockResolvedValue(
      rowsWith({ closedOnShabbat: false }),
    );
    expect(await wentTo(formOf(SHEET, "open"))).toBe(OPENED);
    // A module row the template left out reads as the manifest's default.
    mocks.getBusinessModulesForTeam.mockResolvedValue([]);
    expect(await wentTo(formOf(SHEET, "closed"))).toBe(OPENED);
    expect(mocks.setModuleSettings.mock.calls).toEqual([
      [STAFF, BUSINESS, "scheduling", { closedOnShabbat: true }],
      [STAFF, BUSINESS, "scheduling", { closedOnShabbat: false }],
      [STAFF, BUSINESS, "scheduling", { closedOnShabbat: true }],
    ]);
  });

  it("keeps the template's for a form with no answer, asking nothing", async () => {
    expect(await wentTo(formOf(SHEET, null))).toBe(OPENED);
    expect(await wentTo(formOf(SHEET, ""))).toBe(OPENED);
    expect(mocks.createBusiness).toHaveBeenCalledWith(
      STAFF,
      expect.objectContaining({ closedOnShabbat: null }),
    );
    expect(mocks.getBusinessModulesForTeam).not.toHaveBeenCalled();
    expect(mocks.setModuleSettings).not.toHaveBeenCalled();
  });

  it("refuses an answer that is neither, opening nothing", async () => {
    await expect(
      createBusinessAction({}, formOf(SHEET, "maybe")),
    ).resolves.toEqual({ errors: { shabbat: "invalid" } });
    expect(mocks.onAnotherStaff).not.toHaveBeenCalled();
    expect(mocks.createBusiness).not.toHaveBeenCalled();
    expect(mocks.setModuleSettings).not.toHaveBeenCalled();
  });

  it("saves nothing for a business that didn't open", async () => {
    mocks.createBusiness.mockResolvedValue({ ok: false, error: "slugTaken" });
    await expect(
      createBusinessAction({}, formOf(SHEET, "open")),
    ).resolves.toEqual({ errors: { slug: "taken" } });
    mocks.onAnotherStaff.mockResolvedValue(["+972500006502"]);
    await expect(
      createBusinessAction({}, formOf(SHEET, "open")),
    ).resolves.toMatchObject({ errors: { staff: "elsewhere" } });
    mocks.createBusiness.mockRejectedValue(new Error("Could not create"));
    mocks.onAnotherStaff.mockResolvedValue([]);
    await expect(
      createBusinessAction({}, formOf(SHEET, "open")),
    ).resolves.toEqual({ failure: "failed" });
    expect(mocks.getBusinessModulesForTeam).not.toHaveBeenCalled();
    expect(mocks.setModuleSettings).not.toHaveBeenCalled();
  });

  it("opens the checklist when the answer couldn't be saved, saying so", async () => {
    // The database refused it.
    mocks.setModuleSettings.mockResolvedValue({ ok: false, code: "XX000" });
    expect(await wentTo(formOf(SHEET, "open"))).toBe(UNSAVED);
    // The read before it failed: only its message is logged.
    mocks.getBusinessModulesForTeam.mockRejectedValue(
      new Error("connection reset"),
    );
    expect(await wentTo(formOf(SHEET, "open"))).toBe(UNSAVED);
    expect(logged).toHaveBeenCalledWith(
      "saving Shabbat failed",
      "connection reset",
    );
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/\d{7}/);
    // The business stays open: nothing asks to open it again.
    expect(mocks.createBusiness).toHaveBeenCalledTimes(2);
  });
});

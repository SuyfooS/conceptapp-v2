import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import he from "@/messages/he.json";

// The new-business wizard's last step (inviting from a list, part 6), with
// what it reads and writes stood in for: the team member signed in, the
// other-staff check and the opening in @db, the app's words for the roles
// and the redirect. The staff list is read as the form reads it (a header
// row, an ID column, the app's words), only its people reach the database,
// a number on another staff sends the list back named before anything is
// written, and nothing with a number is logged.

const mocks = vi.hoisted(() => ({
  getPlatformStaff: vi.fn(),
  createBusiness: vi.fn(),
  onAnotherStaff: vi.fn(),
}));
vi.mock("@db/admin", () => ({
  getPlatformStaff: mocks.getPlatformStaff,
  createBusiness: mocks.createBusiness,
}));
vi.mock("@db/invites", () => ({ onAnotherStaff: mocks.onAnotherStaff }));
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

const formOf = (staff: string) => {
  const form = new FormData();
  form.set("template", "retail");
  form.set("name", "חנות בדיקה");
  form.set("slug", "test-shop");
  form.set("address", "");
  form.set("accent", "#0f766e");
  form.set("staff", staff);
  return form;
};

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
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logged.mockRestore();
});

describe("createBusinessAction", () => {
  it("reads the sheet as the form does and invites only its people", async () => {
    await expect(createBusinessAction({}, formOf(SHEET))).rejects.toThrow(
      "redirect /admin/businesses/test-shop?created=1",
    );
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

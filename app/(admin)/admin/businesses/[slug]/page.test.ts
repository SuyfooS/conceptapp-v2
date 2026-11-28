import type { ModuleRow } from "@domain/modules";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The console's business page (closing the pilot, PR 16, after the second
// review): the business's modules, then the checklist's facts from them, are
// read beside what doesn't need them, the roles the business named and its
// invites' sentence, so the page waits one round trip less than reading the
// modules first. The reads in @db and the page's own helpers are stood in for.

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  currentPlatformRole: vi.fn(),
  getBusinessSetup: vi.fn(),
  getBusinessModulesForTeam: vi.fn(),
  getViewableNamedRoles: vi.fn(),
  inviteShareWording: vi.fn(),
  setupModuleFacts: vi.fn(),
}));
vi.mock("../../../staff", () => ({
  currentPlatformRole: mocks.currentPlatformRole,
}));
vi.mock("@db/admin", () => ({ getBusinessSetup: mocks.getBusinessSetup }));
vi.mock("@db/module-settings", () => ({
  getBusinessModulesForTeam: mocks.getBusinessModulesForTeam,
}));
vi.mock("@db/view-as", () => ({
  getViewableNamedRoles: mocks.getViewableNamedRoles,
}));
vi.mock("./invite-wording", () => ({
  inviteShareWording: mocks.inviteShareWording,
}));
vi.mock("./setup-facts", () => ({
  setupModuleFacts: mocks.setupModuleFacts,
}));
vi.mock("./actions", () => ({
  inviteLinkAction: vi.fn(),
  viewAsAction: vi.fn(),
}));
vi.mock("./business-view", () => ({ BusinessView: () => null }));

const { default: BusinessSetupPage } = await import("./page");

const BUSINESS = { id: "11111111-1111-4111-a111-111111111111", slug: "shop" };
const FACTS = { scheduling: null, timeClock: null, pay: null };
const ROLES = [{ id: "role-1", base: "worker", name: "Cashier" }];
const WORDING = { "app.team.pending.message": "{business}" };

/** The general template's rows as it opens a business: the clock uses pay. */
const general: ModuleRow[] = [
  { key: "scheduling", enabled: true, settings: {} },
  { key: "time_clock", enabled: true, settings: {} },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function draw() {
  return BusinessSetupPage({
    params: Promise.resolve({ slug: BUSINESS.slug }),
    searchParams: Promise.resolve({}),
  } as Parameters<typeof BusinessSetupPage>[0]);
}

beforeEach(() => {
  mocks.currentPlatformRole.mockReset().mockResolvedValue("platform_admin");
  mocks.getBusinessSetup.mockReset().mockResolvedValue(BUSINESS);
  mocks.getBusinessModulesForTeam.mockReset().mockResolvedValue(general);
  mocks.getViewableNamedRoles.mockReset().mockResolvedValue(ROLES);
  mocks.inviteShareWording.mockReset().mockResolvedValue(WORDING);
  mocks.setupModuleFacts.mockReset().mockResolvedValue(FACTS);
});

describe("/admin/businesses/<slug>", () => {
  it("reads the named roles and the invites' sentence while the modules are read", async () => {
    const modules = deferred<ModuleRow[]>();
    mocks.getBusinessModulesForTeam.mockReturnValue(modules.promise);
    const page = draw();
    await vi.waitFor(() =>
      expect(mocks.getBusinessModulesForTeam).toHaveBeenCalledWith(BUSINESS.id),
    );
    // The modules are still on their way; the others started all the same.
    expect(mocks.getViewableNamedRoles).toHaveBeenCalledWith(BUSINESS.id);
    expect(mocks.inviteShareWording).toHaveBeenCalledWith(BUSINESS.id);
    expect(mocks.setupModuleFacts).not.toHaveBeenCalled();
    modules.resolve(general);
    const element = await page;
    expect(mocks.setupModuleFacts).toHaveBeenCalledWith(
      BUSINESS.id,
      general,
      true,
    );
    expect(element.props).toMatchObject({
      facts: FACTS,
      namedRoles: ROLES,
      inviteWording: WORDING,
      accessHref: `/admin/businesses/${BUSINESS.slug}/access`,
    });
  });

  it("reads the checklist's facts without waiting for the invites' sentence", async () => {
    const wording = deferred<typeof WORDING>();
    mocks.inviteShareWording.mockReturnValue(wording.promise);
    const page = draw();
    // Its read takes two steps (the template, then its sentences); the
    // modules and their facts go on beside it.
    await vi.waitFor(() =>
      expect(mocks.setupModuleFacts).toHaveBeenCalledWith(
        BUSINESS.id,
        general,
        true,
      ),
    );
    wording.resolve(WORDING);
    expect((await page).props.inviteWording).toEqual(WORDING);
  });

  it("reads who sees pay only where a module that is on uses it", async () => {
    const noPay: ModuleRow[] = [
      { key: "scheduling", enabled: true, settings: {} },
      { key: "time_clock", enabled: false, settings: {} },
    ];
    mocks.getBusinessModulesForTeam.mockResolvedValue(noPay);
    const element = await draw();
    expect(mocks.setupModuleFacts).toHaveBeenCalledWith(
      BUSINESS.id,
      noPay,
      false,
    );
    expect(element.props.accessHref).toBeNull();
  });
});

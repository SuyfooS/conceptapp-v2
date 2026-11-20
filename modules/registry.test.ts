import { Constants } from "@db/database.types";
import {
  CHAT_FILE_DAYS,
  CHAT_FILE_SPACE_MB,
  DEFAULT_CHAT_FILE_DAYS,
  DEFAULT_CHAT_FILE_SPACE_MB,
} from "@domain/chat-files";
import {
  DEFAULT_DOCUMENT_SPACE_MB,
  DOCUMENT_SPACE_MB,
} from "@domain/documents";
import { DEFAULT_LIST_PHOTO_DAYS, LIST_PHOTO_DAYS } from "@domain/list-photos";
import {
  ACCOUNTANT_PERMISSIONS,
  atLeast,
  holdsPermission,
  isStaff,
  MODULE_KEYS,
  type ModuleManifest,
  moduleNav,
  PERMISSION_AREAS,
  ROLES,
  type Role,
  readModuleSettings,
} from "@domain/modules";
import { CORE_PERMISSIONS, permissionsByDefault } from "@domain/permissions";
import { describeSettings, fieldsFor } from "@domain/settings-form";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";
import { manifestFor, manifests, permissions } from "./registry";

describe("module registry", () => {
  it("has one manifest per module key, matching the database enum", () => {
    expect(manifests.map((m) => m.key)).toEqual([...MODULE_KEYS]);
    expect([...Constants.public.Enums.module_key]).toEqual([...MODULE_KEYS]);
    expect([...Constants.public.Enums.member_role]).toEqual([...ROLES]);
  });

  it("finds each manifest by key", () => {
    for (const key of MODULE_KEYS) expect(manifestFor(key).key).toBe(key);
  });

  it("gives every module complete default settings", () => {
    const all: readonly ModuleManifest[] = manifests;
    for (const manifest of all) {
      expect(() => manifest.settings.parse({})).not.toThrow();
      expect(readModuleSettings(manifest, {})).toEqual(
        manifest.settings.parse({}),
      );
    }
  });

  it("gives every nav item its own place next to home", () => {
    // How many fit is checked per business and template (`fitsTabBar`),
    // so the registry may hold more modules with a tab than the bar does.
    const hrefs = manifests.filter((m) => m.nav).map((m) => m.nav?.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).not.toContain("/home");
  });

  it("only puts home cards on modules with a screen", () => {
    for (const m of manifests) if (m.homeWidget) expect(m.nav).not.toBeNull();
  });

  it("names each permission once, the core ones included", () => {
    const keys = permissions.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining(CORE_PERMISSIONS.map((p) => p.key)),
    );
  });

  it("puts a module's permissions in its own area, and the core ones in the team's or the management page's", () => {
    // public.permission_keys checks the same (permission_keys_module_area_check).
    for (const p of permissions) {
      expect(PERMISSION_AREAS).toContain(p.area);
      if (p.module !== null) {
        expect(p.area).toBe(p.module);
      } else {
        expect(["team", "manage"]).toContain(p.area);
        expect(p.key.startsWith(`${p.area}.`)).toBe(true);
      }
    }
  });

  it("requires only a key of the same area that its default roles hold too, in chains that end", () => {
    const byKey = new Map<string, (typeof permissions)[number]>(
      permissions.map((p) => [p.key, p]),
    );
    // Chat's own chains are its test's below (each area's phase checks its own).
    const chains = Object.fromEntries(
      permissions.flatMap((p) =>
        p.requires && p.area !== "chat" ? [[p.key, p.requires]] : [],
      ),
    );
    expect(chains).toEqual({
      "schedule.publish": "schedule.edit",
      "lists.send": "lists.manage",
      "team.edit": "team.view",
      "manage.edit": "manage.view",
    });
    for (const p of permissions) {
      const seen: string[] = [p.key];
      let next: string | null | undefined = p.requires;
      for (; next; next = byKey.get(next)?.requires) {
        const needed = byKey.get(next);
        expect(needed?.area).toBe(p.area);
        // Else the role would hold the key by default and never use it.
        expect(needed?.defaultRoles).toEqual(
          expect.arrayContaining(p.defaultRoles),
        );
        expect(seen).not.toContain(next);
        seen.push(next);
      }
    }
  });

  it("lets owners switch scheduling's, the clock's, lists', taking orders', the team's and the management page's permissions per role, nothing else yet, and never pay", () => {
    // Each area's phase turns its keys on once every check in the area reads
    // them (the roles plan): scheduling's in R3, the clock's in R4, lists' in
    // R5, the team's in R6, the management page's in R7. lists.fix came
    // settable (L6b-2), so lists stays open on the roles screen, and so did
    // order_taking.edit (waiter mode P1). clock.payroll keeps its own
    // switch. Chat's are its own test's below (R8).
    expect(
      permissions
        .filter((p) => p.settable && p.area !== "chat")
        .map((p) => p.key)
        .sort(),
    ).toEqual([
      "clock.edit",
      "lists.fix",
      "lists.manage",
      "lists.send",
      "manage.edit",
      "manage.view",
      "order_taking.edit",
      "schedule.edit",
      "schedule.publish",
      "team.edit",
      "team.view",
    ]);
    expect(permissions.find((p) => p.key === "clock.payroll")?.settable).toBe(
      false,
    );
  });

  it("keeps today's rules while the database can't answer", () => {
    // permissionsByDefault, which the session falls back on while
    // public.my_permissions is missing, against the app's rule before the
    // roles plan's R1 (holdsPermission with its own defaults, over the
    // permissions given alone): the same for every role, given set and key.
    const before = (role: Role, given: readonly string[], key: string) => {
      if (role === "owner") return true;
      if (!isStaff(role)) return ACCOUNTANT_PERMISSIONS.includes(key);
      if (given.includes(key)) return true;
      const declared = manifests
        .flatMap((m) => m.permissions)
        .find((p) => p.key === key);
      return (
        declared !== undefined &&
        !declared.byOwner &&
        atLeast(role, declared.defaultRole)
      );
    };
    const moduleKeys = manifests.flatMap((m) =>
      m.permissions.map((p) => p.key),
    );
    const keys = [...moduleKeys, "billing.manage"];
    const givenSets = [
      [],
      ["schedule.publish"],
      ["clock.payroll", "lists.manage"],
      ["billing.manage"],
    ];
    for (const role of ROLES) {
      for (const given of givenSets) {
        for (const viewing of [false, true]) {
          const perms = permissionsByDefault(permissions, {
            role,
            given,
            viewing,
          });
          for (const key of keys) {
            expect(
              holdsPermission({ role, perms }, key),
              `${role} ${viewing ? "viewing" : ""} [${given}] ${key}`,
            ).toBe(before(role, viewing ? [] : given, key));
          }
        }
      }
    }
  });

  it("gives lists the default roles their SQL helpers hold", () => {
    // private.can_manage_lists, private.can_send_lists and
    // private.can_fix_list let managers (and owners) in without the
    // permission; a change here changes them too.
    const roles = Object.fromEntries(
      manifestFor("lists").permissions.map((p) => [p.key, p.defaultRole]),
    );
    expect(roles).toEqual({
      "lists.manage": "manager",
      "lists.send": "manager",
      "lists.fix": "manager",
    });
  });

  it("lets someone given lists.fix fix a list without running them, at view", () => {
    // L6b-2: the first switch at view. It requires nothing, so a role holds
    // it by its own rule, and owners switch it per role from the start.
    const fix = permissions.find((p) => p.key === "lists.fix");
    expect(fix).toMatchObject({
      module: "lists",
      area: "lists",
      requires: null,
      settable: true,
      byOwner: false,
      defaultRoles: ["manager"],
    });
  });

  it("lets owners choose how long a closed list can be fixed, a day at first", () => {
    // L6b-2, Orel's default on Q2. private.list_fix_hours reads only these
    // values, anything else stored as 24, and private.list_settings holds the
    // same default (20261116000400_lists_fix_switch.sql).
    const manifest = manifestFor("lists");
    const field = describeSettings(manifest.settings).find(
      (f) => f.key === "fixHours",
    );
    expect(field?.level).toBe("owner");
    expect(field?.kind === "choice" ? field.options : null).toEqual([
      2, 12, 24, 72,
    ]);
    expect(manifest.settings.parse({}).fixHours).toBe(24);
    // Owners on /manage/lists and the team in the console; not the business's
    // other editors.
    for (const level of ["owner", "team"] as const) {
      expect(
        fieldsFor(manifest.settings, level).map((f) => f.key),
        level,
      ).toContain("fixHours");
    }
    expect(
      fieldsFor(manifest.settings, "business").map((f) => f.key),
    ).not.toContain("fixHours");
    // A value not offered reads as the default, the others stay.
    expect(
      readModuleSettings(manifest, { fixHours: 48, lateAfterMinutes: 30 }),
    ).toMatchObject({ fixHours: 24, lateAfterMinutes: 30 });
    expect(readModuleSettings(manifest, { fixHours: 2 }).fixHours).toBe(2);
    expect(readModuleSettings(manifest, { fixHours: "12" }).fixHours).toBe(24);
  });

  it("leaves how long lists' photos are kept to the team, 90 days at first", () => {
    // Storage is what could cost (L6; Orel's default on #1): owners and
    // managers don't see it on /manage, and the app refuses it from them
    // (checkSettingsChange); private.list_settings holds the same default,
    // and public.expired_list_photos reads only the values offered here.
    const settings = manifestFor("lists").settings;
    const field = describeSettings(settings).find((f) => f.key === "photoDays");
    expect(field?.level).toBe("team");
    expect(field?.kind === "choice" ? field.options : null).toEqual([
      ...LIST_PHOTO_DAYS,
    ]);
    expect(settings.parse({}).photoDays).toBe(DEFAULT_LIST_PHOTO_DAYS);
    expect(fieldsFor(settings, "owner").map((f) => f.key)).not.toContain(
      "photoDays",
    );
  });

  it("lets the business choose when its owners hear a list is still late, an hour at first", () => {
    // Orel, 15 November 2026: the step after the late line. The minute job
    // reads only these values, anything else stored as 60, and
    // private.list_settings holds the same default
    // (20261115000500_lists_owners_late.sql).
    const manifest = manifestFor("lists");
    const field = describeSettings(manifest.settings).find(
      (f) => f.key === "tellOwnersAfterMinutes",
    );
    expect(field?.level).toBe("business");
    expect(field?.kind === "choice" ? field.options : null).toEqual([
      0, 30, 60, 120,
    ]);
    expect(manifest.settings.parse({}).tellOwnersAfterMinutes).toBe(60);
    // Owners and managers see it on /manage/lists, the team in the console.
    for (const level of ["business", "owner", "team"] as const) {
      expect(
        fieldsFor(manifest.settings, level).map((f) => f.key),
        level,
      ).toContain("tellOwnersAfterMinutes");
    }
    // Drawn after the managers' own line about a late list.
    const keys = describeSettings(manifest.settings).map((f) => f.key);
    expect(keys.indexOf("tellOwnersAfterMinutes")).toBe(
      keys.indexOf("tellManagersWhenLate") + 1,
    );
    // A value not offered reads as the default, the others stay.
    expect(
      readModuleSettings(manifest, {
        tellOwnersAfterMinutes: 45,
        lateAfterMinutes: 30,
      }),
    ).toMatchObject({ tellOwnersAfterMinutes: 60, lateAfterMinutes: 30 });
    expect(
      readModuleSettings(manifest, { tellOwnersAfterMinutes: 0 })
        .tellOwnersAfterMinutes,
    ).toBe(0);
  });

  it("gives taking orders one key of its own area, managers' by default, switched per role, and no tab", () => {
    // Waiter mode P1: private.runs_orders asks it (owners always hold it),
    // and private.settings_perm and private.log_perm name it
    // (20261117000500_order_taking_menu.sql). No tab: the bar is full, and
    // the mode draws its own items later; nothing on Home either.
    const manifest = manifestFor("order_taking");
    expect(manifest.permissions).toEqual([
      {
        key: "order_taking.edit",
        area: "order_taking",
        defaultRole: "manager",
        settable: true,
      },
    ]);
    expect(manifest.nav).toBeNull();
    expect(manifest.homeWidget).toBeNull();
    expect(he.modules.order_taking.name).toBe("קבלת הזמנות");
  });

  it("gives taking orders the settings its SQL readers default to, the owner's fields kept to owners and the team", () => {
    // Waiter mode P3 (20261120000200_order_taking_takers.sql):
    // private.order_taking_settings holds the same defaults
    // (modules/order_taking/settings.db.test.ts), and set_module_settings
    // keeps who takes orders, the clock rule and the take-back time to
    // owners and the team.
    const manifest = manifestFor("order_taking");
    expect(manifest.settings.parse({})).toEqual({
      takerDepartments: [],
      onlyOnTheClock: true,
      takeBackMinutes: 2,
      lateAfterMinutes: 15,
      dayEndsAt: "05:00",
    });
    // Who takes orders is on no screen until P4 draws its departments.
    const fields = describeSettings(manifest.settings);
    expect(fields.map((f) => f.key)).toEqual([
      "onlyOnTheClock",
      "takeBackMinutes",
      "lateAfterMinutes",
      "dayEndsAt",
    ]);
    expect(Object.fromEntries(fields.map((f) => [f.key, f.level]))).toEqual({
      onlyOnTheClock: "owner",
      takeBackMinutes: "owner",
      lateAfterMinutes: "business",
      dayEndsAt: "business",
    });
    // A manager sees the two of the business's level; owners and the team all four.
    expect(fieldsFor(manifest.settings, "business").map((f) => f.key)).toEqual([
      "lateAfterMinutes",
      "dayEndsAt",
    ]);
    expect(fieldsFor(manifest.settings, "owner")).toHaveLength(4);
    const takeBack = fields.find((f) => f.key === "takeBackMinutes");
    expect(takeBack?.kind === "choice" ? takeBack.options : null).toEqual([
      0, 2, 5,
    ]);
    expect(fields.find((f) => f.key === "dayEndsAt")).toMatchObject({
      kind: "editor",
      editor: "time",
    });
    // A value not offered reads as the default, field by field.
    expect(
      readModuleSettings(manifest, {
        takeBackMinutes: 3,
        lateAfterMinutes: 30,
        takerDepartments: ["floor", "floor"],
        dayEndsAt: "24:00",
      }),
    ).toEqual({
      takerDepartments: [],
      onlyOnTheClock: true,
      takeBackMinutes: 2,
      lateAfterMinutes: 30,
      dayEndsAt: "05:00",
    });
    expect(
      readModuleSettings(manifest, { takerDepartments: ["floor", "bar"] })
        .takerDepartments,
    ).toEqual(["floor", "bar"]);
  });

  it("gives chat the default roles its SQL helpers hold", () => {
    // public.send_chat_message and private.chat_moderates ask
    // private.holds_perm, which reads these from public.permission_keys
    // (modules/permissions.db.test.ts): owners hold all three, managers by
    // default, and nobody off the staff.
    const roles = Object.fromEntries(
      manifestFor("chat").permissions.map((p) => [p.key, p.defaultRole]),
    );
    expect(roles).toEqual({
      "chat.announce": "manager",
      "chat.moderate": "manager",
      "chat.send_documents": "manager",
    });
  });

  it("lets owners switch chat's permissions per role, announcing and sending documents under moderating", () => {
    // The roles plan's R8 (Orel, 15 November 2026): moderating is chat's
    // edit, and announcing and sending documents are switches under it, so
    // a role holds them by its role only while it moderates
    // (public.permission_keys.requires, private.holds_perm).
    const chat = permissions.filter((p) => p.area === "chat");
    expect(
      Object.fromEntries(
        chat.map((p) => [
          p.key,
          { settable: p.settable, requires: p.requires },
        ]),
      ),
    ).toEqual({
      "chat.announce": { settable: true, requires: "chat.moderate" },
      "chat.moderate": { settable: true, requires: null },
      "chat.send_documents": { settable: true, requires: "chat.moderate" },
    });
  });

  it("puts chat's tab after lists, ahead of reservations", () => {
    // moduleNav cuts at four module tabs: if reservations ever comes back
    // beside chat, the cut drops reservations (fitsTabBar refuses it first).
    const order = (key: "chat" | "lists" | "reservations") =>
      manifestFor(key).nav?.order ?? 0;
    expect(order("chat")).toBeGreaterThan(order("lists"));
    expect(order("chat")).toBeLessThan(order("reservations"));
  });

  it("leaves chat's files and space to the team, and its team's group to the business", () => {
    // Storage is what could cost (§6.6 of the chat plan): owners and
    // managers see only who writes in the whole team's group.
    const settings = manifestFor("chat").settings;
    expect(settings.parse({})).toEqual({
      teamGroupWho: "everyone",
      fileDays: 90,
      fileSpaceMb: 100,
      documentSpaceMb: 50,
    });
    expect(fieldsFor(settings, "owner").map((f) => f.key)).toEqual([
      "teamGroupWho",
    ]);
  });

  it("keeps chat's files for the days and space public.expired_files reads", () => {
    // C4: the database counts only these choices, anything else stored as
    // the default (20261111000500_chat_files.sql).
    const settings = manifestFor("chat").settings;
    const fields = describeSettings(settings);
    const options = (key: string) => {
      const field = fields.find((f) => f.key === key);
      return field?.kind === "choice" ? field.options : null;
    };
    expect(options("fileDays")).toEqual([...CHAT_FILE_DAYS]);
    expect(options("fileSpaceMb")).toEqual([...CHAT_FILE_SPACE_MB]);
    expect(settings.parse({}).fileDays).toBe(DEFAULT_CHAT_FILE_DAYS);
    expect(settings.parse({}).fileSpaceMb).toBe(DEFAULT_CHAT_FILE_SPACE_MB);
    for (const key of ["fileDays", "fileSpaceMb"]) {
      expect(fields.find((f) => f.key === key)?.level).toBe("team");
    }
  });

  it("gives owners and managers the reminders' timings, as private.reminder_settings reads them", () => {
    // Notifications part 4: /manage/notifications draws these two, and the
    // database counts only these choices, anything else stored as the
    // default (20261112000200_reminders.sql; reminders.db.test.ts compares
    // the two). The reminder before a shift stays hidden until Orel asks.
    const settings = manifestFor("notifications").settings;
    const fields = fieldsFor(settings, "business");
    expect(
      fields.map((f) => [f.key, f.kind === "choice" && f.options]),
    ).toEqual([
      ["availabilityReminderHours", [0, 3, 12, 24, 48]],
      ["clockOutReminderMinutes", [0, 30, 60, 120]],
    ]);
    expect(fieldsFor(settings, "team").map((f) => f.key)).not.toContain(
      "shiftReminderHours",
    );
    expect(settings.parse({})).toMatchObject({
      availabilityReminderHours: 24,
      clockOutReminderMinutes: 60,
    });
    // Words for every choice, in both languages, as /manage shows them.
    for (const messages of [he, en]) {
      const words = messages.modules.notifications.settings;
      for (const field of fields) {
        const own = words[field.key as keyof typeof words];
        expect(own.label, field.key).toBeTruthy();
        expect(own.hint, field.key).toBeTruthy();
        if (field.kind !== "choice") continue;
        for (const option of field.options) {
          expect(
            own.options[String(option) as keyof typeof own.options],
            `${field.key} ${option}`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("gives documents the space private.document_space_bytes reads, the team's", () => {
    // C6: 50 MB unless the team chose 100 or 200, anything else stored read
    // as 50 (20261111000700_documents.sql); documents are never deleted for
    // space, so past it new ones are refused.
    const settings = manifestFor("chat").settings;
    const field = describeSettings(settings).find(
      (f) => f.key === "documentSpaceMb",
    );
    expect(field?.kind === "choice" ? field.options : null).toEqual([
      ...DOCUMENT_SPACE_MB,
    ]);
    expect(field?.level).toBe("team");
    expect(settings.parse({}).documentSpaceMb).toBe(DEFAULT_DOCUMENT_SPACE_MB);
    expect(fieldsFor(settings, "owner").map((f) => f.key)).not.toContain(
      "documentSpaceMb",
    );
  });

  it("starts every permission an owner gives with the owner alone", () => {
    // public.permission_keys refuses default roles for one (payroll P2): an
    // owner switches it on for managers, workers or a person.
    const byOwner = manifests.flatMap((m) =>
      m.permissions.filter((p) => p.byOwner),
    );
    expect(byOwner.map((p) => p.key)).toEqual(["clock.payroll"]);
    for (const p of byOwner) expect(p.defaultRole).toBe("owner");
  });

  it("opens a tab off the staff only by a permission its module declares, or the one it names, with its words", () => {
    // An accountant's tab (payroll P3): its label is modules.<key>.outsideNav,
    // and its own screen, not the module's, checks the permission. Chat's
    // documents (C7) are the office's, and the office is whoever holds
    // time_clock's clock.payroll (private.in_office), so its tab names that
    // module (`from`) rather than declaring a second key for the same thing.
    const outside = manifests.flatMap((m) =>
      m.nav?.outsideStaff ? [{ m, tab: m.nav.outsideStaff }] : [],
    );
    expect(outside.map(({ m }) => m.key)).toEqual(["time_clock", "chat"]);
    for (const { m, tab } of outside) {
      const declaring = tab.from ? manifestFor(tab.from) : m;
      expect(tab.from).not.toBe(m.key);
      expect(declaring.permissions.map((p) => p.key)).toContain(tab.perm);
      expect(tab.href).not.toBe(m.nav?.href);
      expect(tab.href.startsWith(`${m.nav?.href}/`)).toBe(true);
      for (const messages of [he, en]) {
        const words = messages.modules[m.key] as Record<string, unknown>;
        expect(typeof words.outsideNav).toBe("string");
      }
    }
  });

  it("gives an accountant the hours for payroll and the documents, and no chat", () => {
    // Plan §11.8: Home, "שעות לשכר" (/clock/pay) and "מסמכים"
    // (/chat/documents). The pay permission is all an accountant holds.
    expect(manifestFor("chat").nav?.outsideStaff).toEqual({
      perm: "clock.payroll",
      from: "time_clock",
      href: "/chat/documents",
      icon: "documents",
    });
    expect(he.modules.chat.outsideNav).toBe("מסמכים");
    const on = manifests.map((m) => m.key);
    expect(
      moduleNav(manifests, on, {
        role: "accountant",
        perms: ["clock.payroll"],
      }),
    ).toEqual([
      { key: "time_clock", href: "/clock/pay", icon: "clock", outside: true },
      {
        key: "chat",
        href: "/chat/documents",
        icon: "documents",
        outside: true,
      },
    ]);
    expect(moduleNav(manifests, on, { role: "accountant", perms: [] })).toEqual(
      [],
    );
  });

  it("only requires modules that exist", () => {
    for (const m of manifests) {
      for (const dep of m.requires) expect(MODULE_KEYS).toContain(dep);
      expect(m.requires).not.toContain(m.key);
    }
  });

  it("has a name and description in Hebrew and English for every module", () => {
    for (const key of MODULE_KEYS) {
      for (const messages of [he, en]) {
        expect(messages.modules[key].name).toBeTruthy();
        expect(messages.modules[key].description).toBeTruthy();
      }
    }
  });
});

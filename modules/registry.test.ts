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
  MODULE_KEYS,
  type ModuleManifest,
  moduleNav,
  ROLES,
  readModuleSettings,
} from "@domain/modules";
import { describeSettings, fieldsFor } from "@domain/settings-form";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";
import { manifestFor, manifests } from "./registry";

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

  it("names each permission once", () => {
    const keys = manifests.flatMap((m) => m.permissions.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives lists the default roles their SQL helpers hold", () => {
    // private.can_manage_lists and private.can_send_lists let managers (and
    // owners) in without the permission; a change here changes them too.
    const roles = Object.fromEntries(
      manifestFor("lists").permissions.map((p) => [p.key, p.defaultRole]),
    );
    expect(roles).toEqual({
      "lists.manage": "manager",
      "lists.send": "manager",
    });
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

import type {
  NotificationEntry,
  NotificationLine,
} from "@domain/notifications";
import { describe, expect, it, vi } from "vitest";
import he from "@/messages/he.json";

vi.mock("server-only", () => ({}));

const { roleChangeWords } = await import("./role-change-words");
const { pushWords } = await import("@/app/push/words");
const { baseWording } = await import("../wording");

// The roles plan's R10 (Orel, 16 November 2026): what the people in a role
// read when an owner changes what it does, in the roles screen's own words
// for the area and its switches ("מעכשיו עורכים בסידור", "מעכשיו בלי פרסום
// הסידור"), the title naming their role.

const words = he.app.notifications.kinds.role.changed;
const roles = he.app.manage.roles;
const fill = (text: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replace(`{${key}}`, value),
    text,
  );
const join = (items: string[]) => items.join(" + ");

type RoleLine = Extract<NotificationLine, { kind: "role.changed" }>;
const line = (
  area: RoleLine["area"],
  change: RoleLine["change"],
  role: RoleLine["role"] = { kind: "base", base: "manager" },
): RoleLine => ({ kind: "role.changed", role, area, change });

const say = (l: RoleLine) => roleChangeWords(l, baseWording, join);

describe("a role's change in words", () => {
  it("says a level given, with the switches it brought", () => {
    expect(say(line("scheduling", { level: "edit", on: [], off: [] }))).toEqual(
      {
        title: fill(words.title, { role: he.app.team.roles.manager }),
        change: fill(words.edit, { area: he.modules.scheduling.name }),
      },
    );
    expect(
      say(line("lists", { level: "edit", on: ["lists.send"], off: [] })).change,
    ).toBe(
      fill(words.editWith, {
        area: he.modules.lists.name,
        extras: roles.extras.lists.send.phrase,
      }),
    );
  });

  it("says a level taken, with the switches that went with it", () => {
    expect(
      say(
        line("scheduling", {
          level: "view",
          on: [],
          off: ["schedule.publish"],
        }),
      ).change,
    ).toBe(
      fill(words.viewWithout, {
        area: he.modules.scheduling.name,
        extras: roles.extras.schedule.publish.phrase,
      }),
    );
    expect(
      say(line("time_clock", { level: "view", on: [], off: [] })).change,
    ).toBe(fill(words.view, { area: he.modules.time_clock.name }));
    expect(say(line("team", { level: "none", on: [], off: [] })).change).toBe(
      fill(words.none, { area: roles.areas.team }),
    );
  });

  it("says a switch alone, on, off or both", () => {
    const chat = roles.extras.chat;
    expect(
      say(
        line("scheduling", { level: null, on: [], off: ["schedule.publish"] }),
      ).change,
    ).toBe(
      fill(words.extraOff, { extras: roles.extras.schedule.publish.phrase }),
    );
    expect(
      say(
        line("scheduling", { level: null, on: [], off: ["schedule.publish"] }),
      ).change,
    ).toBe("מעכשיו בלי פרסום הסידור");
    expect(
      say(
        line("chat", {
          level: null,
          on: ["chat.announce", "chat.send_documents"],
          off: [],
        }),
      ).change,
    ).toBe(
      fill(words.extraOn, {
        extras: `${chat.announce.phrase} + ${chat.send_documents.phrase}`,
      }),
    );
    expect(
      say(
        line("chat", {
          level: null,
          on: ["chat.send_documents"],
          off: ["chat.announce"],
        }),
      ).change,
    ).toBe(
      fill(words.extraBoth, {
        on: chat.send_documents.phrase,
        off: chat.announce.phrase,
      }),
    );
  });

  // L6b-2: fixing closed lists, at view, in the roles screen's words.
  it("says fixing closed lists on and off at view, and the lists' edit as before", () => {
    const senior = { kind: "named" as const, name: "עובד בכיר" };
    const on = say(
      line("lists", { level: null, on: ["lists.fix"], off: [] }, senior),
    );
    expect(on).toEqual({
      title: "ההרשאות בתפקיד עובד בכיר השתנו",
      change: "מעכשיו גם תיקון רשימות שנסגרו",
    });
    expect(on.change).toBe(
      fill(words.extraOn, { extras: roles.extras.lists.fix.phrase }),
    );
    expect(
      say(line("lists", { level: null, on: [], off: ["lists.fix"] }, senior))
        .change,
    ).toBe("מעכשיו בלי תיקון רשימות שנסגרו");
    // Raising and lowering the lists say what they said before.
    expect(
      say(line("lists", { level: "edit", on: ["lists.send"], off: [] })).change,
    ).toBe("מעכשיו עורכים ברשימות, עם שליחת רשימות");
    expect(
      say(line("lists", { level: "view", on: [], off: ["lists.send"] })).change,
    ).toBe("מעכשיו ברשימות רואים בלי לערוך, ובלי שליחת רשימות");
  });

  it("names a role the business named, or the reader's own when the line lost it", () => {
    const edit: RoleLine["change"] = { level: "edit", on: [], off: [] };
    expect(
      say(line("lists", edit, { kind: "named", name: "אחראי משמרת" })).title,
    ).toBe(fill(words.title, { role: "אחראי משמרת" }));
    expect(say(line("lists", edit, { kind: "named", name: null })).title).toBe(
      words.titleOwn,
    );
    expect(
      say(line("lists", edit, { kind: "base", base: "worker" })).title,
    ).toBe(fill(words.title, { role: he.app.team.roles.worker }));
  });

  it("are the inbox's words on a phone too, the team named when it was the team", () => {
    const change = line("scheduling", { level: "edit", on: [], off: [] });
    const entry = (actor: NotificationEntry["actor"]): NotificationEntry => ({
      id: "0a000000-0000-4000-a000-000000000001",
      at: "2026-11-16T08:10:00.000Z",
      read: false,
      settled: false,
      actor,
      group: null,
      href: "/schedule",
      line: change,
    });
    const expected = roleChangeWords(change, baseWording, join);
    expect(
      pushWords(
        entry({ kind: "member", name: "אורי" }),
        baseWording,
        "Asia/Jerusalem",
      ),
    ).toEqual({ title: expected.title, body: expected.change });
    expect(
      pushWords(entry({ kind: "team" }), baseWording, "Asia/Jerusalem"),
    ).toEqual({
      title: expected.title,
      body: `${expected.change}\n${words.byTeam}`,
    });
  });
});

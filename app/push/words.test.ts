import type {
  NotificationEntry,
  NotificationLine,
} from "@domain/notifications";
import { describe, expect, it, vi } from "vitest";
import he from "@/messages/he.json";

vi.mock("server-only", () => ({}));

const { pushNotice, pushWords } = await import("./words");
const { baseWording } = await import("@/app/(app)/wording");

const words = he.app.notifications.kinds.chat;

const entry = (line: NotificationLine, settled = false): NotificationEntry => ({
  id: "0a000000-0000-4000-a000-000000000001",
  at: "2026-11-11T08:10:00.000Z",
  read: false,
  settled,
  actor: { kind: "member", name: "שירן הדגמה" },
  group: "chat",
  href: "/chat/0b000000-0000-4000-a000-000000000002",
  line,
});

const say = (line: NotificationLine, settled = false) =>
  pushWords(entry(line, settled), baseWording, "Asia/Jerusalem");

// What a chat's lines say on a phone (chat C1 and C3): who and where, and that
// an announcement waits for "קראתי", never a word of any message, since the
// lines hold none and a lock screen is seen by whoever is near the phone.
describe("a chat's words on the phone", () => {
  const from = { kind: "member", name: "שירן הדגמה" } as const;

  it("names an announcement and its group, and asks for the confirmation", () => {
    expect(
      say({ kind: "chat.announcement", from, chat: { kind: "team" } }),
    ).toEqual({
      title: words.announcement.title,
      body: words.announcement.bodyTeam,
    });
    expect(
      say({
        kind: "chat.announcement",
        from,
        chat: { kind: "department", name: "מטבח" },
      }),
    ).toEqual({
      title: words.announcement.title,
      body: words.announcement.body.replace("{group}", "מטבח"),
    });
    expect(say({ kind: "chat.announcement", from, chat: null }).body).toBe(
      words.announcement.bodyPlain,
    );
  });

  it("says once it was settled that it no longer waits", () => {
    expect(
      say({ kind: "chat.announcement", from, chat: { kind: "team" } }, true)
        .body,
    ).toBe(words.announcement.settledNote);
  });

  it("names who wrote and how many wait in a private chat and a group", () => {
    const direct = say({ kind: "chat.direct", from, count: 3 });
    expect(direct.title).toBe("שירן הדגמה");
    expect(direct.body).toContain("3");
    const group = say({
      kind: "chat.group",
      from,
      count: 1,
      chat: { kind: "team" },
    });
    expect(group.title).toBe(words.group.titleTeam);
    expect(group.body).toContain("שירן הדגמה");
  });
});

// What a document's lines say on a phone (chat C6): who sent it, and that it
// waits for "קראתי", never its category, title or file, even when the line
// was read with its category (only the inbox looks one up).
describe("a document's words on the phone", () => {
  const documents = he.app.notifications.kinds.documents;
  const categories = Object.values(he.app.chat.documents.categories);
  const from = { kind: "member", name: "נועה הדגמה" } as const;

  const never = (said: { title: string; body?: string }) => {
    for (const category of categories) {
      expect(said.title).not.toContain(category);
      expect(said.body ?? "").not.toContain(category);
    }
  };

  it("names who sent one to the business, and nothing of what it is", () => {
    const said = say({
      kind: "documents.received",
      from,
      category: "sick_note",
    });
    expect(said).toEqual({
      title: documents.received.title.replace("{name}", "נועה הדגמה"),
    });
    never(said);
    expect(
      say({ kind: "documents.received", from, category: null }, true).body,
    ).toBe(documents.received.settledNote);
  });

  it("says one came from the business, and asks for the confirmation", () => {
    for (const category of ["payslip", "procedure", "contract"] as const) {
      const sent = say({ kind: "documents.sent", from, category });
      expect(sent).toEqual({ title: documents.sent.title });
      never(sent);
      const asks = say({ kind: "documents.to_confirm", from, category });
      expect(asks).toEqual({
        title: documents.to_confirm.title,
        body: documents.to_confirm.body,
      });
      never(asks);
    }
    expect(
      say({ kind: "documents.to_confirm", from, category: null }, true).body,
    ).toBe(documents.to_confirm.settledNote);
  });
});

// With details kept off the lock screen (notifications part 3), a line says
// its group alone: no name, no shift, no time, and no body.
describe("a line with details kept off the lock screen", () => {
  const hidden = he.app.notifications.push.notice.hidden;
  const from = { kind: "member", name: "שירן הדגמה" } as const;
  const shift = {
    day: "2026-11-17",
    name: "ערב",
    start: "16:00",
    end: "23:00",
  };

  it("says its group alone", () => {
    const notice = pushNotice(
      {
        ...entry({ kind: "swap.offered", shift, from }),
        group: "swaps",
      },
      baseWording,
      "Asia/Jerusalem",
      { previews: false },
    );
    expect(notice.title).toBe(hidden.swaps);
    expect(notice.body).toBeUndefined();
    expect(JSON.stringify(notice)).not.toContain("שירן");
    expect(JSON.stringify(notice)).not.toContain("16:00");
    expect(notice.url).toBe(
      "/notifications/open/0a000000-0000-4000-a000-000000000001",
    );
  });

  it("says only that something is new for a line with no group", () => {
    const notice = pushNotice(
      { ...entry({ kind: "pay.wage_set", since: "2026-11-01" }), group: null },
      baseWording,
      "Asia/Jerusalem",
      { previews: false, again: true },
    );
    expect(notice).toMatchObject({ title: hidden.other, silent: true });
    expect(notice.body).toBeUndefined();
  });

  it("shows the line itself by default", () => {
    const notice = pushNotice(
      entry({ kind: "chat.direct", from, count: 2 }),
      baseWording,
      "Asia/Jerusalem",
    );
    expect(notice.title).toBe("שירן הדגמה");
    expect(notice.silent).toBeUndefined();
  });
});

// What the reminders say on a phone (notifications part 4): what they ask for
// and by when, on the business's clock, from what the line holds (a week, a
// moment, a count). Never who hasn't sent availability: the count alone.
describe("the reminders' words on the phone", () => {
  const kinds = he.app.notifications.kinds;
  const ltr = (text: string) => `⁦${text}⁩`;
  // Wednesday 25 November 2026 at 18:00 in Israel, for the week of 29.11.
  const dueAt = "2026-11-25T16:00:00.000Z";
  const reminder = (line: NotificationLine, settled = false) =>
    pushWords(
      { ...entry(line, settled), actor: { kind: "unknown" } },
      baseWording,
      "Asia/Jerusalem",
    );

  it("asks for next week's availability, and says by when", () => {
    expect(
      reminder({ kind: "availability.due", startsOn: "2026-11-29", dueAt }),
    ).toEqual({
      title: "תזכורת לשלוח זמינות לשבוע של 29.11",
      body: `עוד לא נשלחה. אפשר לשלוח עד יום רביעי בשעה ${ltr("18:00")}`,
    });
    // Without its moment it still asks; once sent, it says nothing waits.
    expect(
      reminder({
        kind: "availability.due",
        startsOn: "2026-11-29",
        dueAt: null,
      }),
    ).toEqual({ title: "תזכורת לשלוח זמינות לשבוע של 29.11" });
    expect(
      reminder(
        { kind: "availability.due", startsOn: "2026-11-29", dueAt },
        true,
      ),
    ).toEqual({ title: "הזמינות לשבוע של 29.11 כבר לא מחכה לך" });
  });

  it("tells managers how many haven't sent it, never who", () => {
    const missing = (count: number, settled = false) =>
      reminder(
        {
          kind: "availability.missing",
          startsOn: "2026-11-29",
          dueAt,
          missing: count,
        },
        settled,
      );
    expect(missing(3)).toEqual({
      title: "חסרות 3 תשובות בזמינות לשבוע של 29.11",
      body: `המועד היה יום רביעי בשעה ${ltr("18:00")}. בזמינות הצוות רואים מי עוד לא שלח`,
    });
    expect(missing(1).title).toBe("חסרה תשובה אחת בזמינות לשבוע של 29.11");
    expect(missing(0).title).toBe("הגיע המועד לזמינות לשבוע של 29.11");
    expect(missing(3, true)).toEqual({
      title: "הזמינות לשבוע של 29.11 כבר לא מחכה לך",
    });
  });

  it("reminds someone to clock out, by their shift's end or their arrival", () => {
    const since = "2026-11-25T05:55:00.000Z";
    expect(
      reminder({
        kind: "clock.open",
        since,
        shiftEnd: "2026-11-25T14:00:00.000Z",
      }),
    ).toEqual({
      title: kinds.clock.open.title,
      body: `המשמרת נגמרה ב-${ltr("16:00")}, ועוד לא נרשמה יציאה`,
    });
    expect(reminder({ kind: "clock.open", since, shiftEnd: null })).toEqual({
      title: kinds.clock.open.title,
      body: `נרשמה כניסה ביום רביעי ב-${ltr("07:55")}, ועוד לא נרשמה יציאה`,
    });
    expect(
      reminder({ kind: "clock.open", since: null, shiftEnd: null }).body,
    ).toBe(kinds.clock.open.plain);
    expect(
      reminder({ kind: "clock.open", since, shiftEnd: null }, true),
    ).toEqual({ title: kinds.clock.open.settledTitle });
  });

  it("names whose shift is open too long, or says it is the reader's own", () => {
    const since = "2026-11-24T06:00:00.000Z";
    const person = { kind: "member", name: "יואב לוי" } as const;
    expect(
      reminder({ kind: "clock.overdue", person, since, mine: false }),
    ).toEqual({
      title: "משמרת פתוחה יותר מ-24 שעות: יואב לוי",
      body: `כניסה ביום שלישי ב-${ltr("08:00")}, בלי יציאה\n${kinds.clock.overdue.note}`,
    });
    const mine = reminder({ kind: "clock.overdue", person, since, mine: true });
    expect(mine.title).toBe(kinds.clock.overdue.titleMine);
    expect(JSON.stringify(mine)).not.toContain("יואב");
    // Corrected: it says so, and asks for nothing.
    expect(
      reminder({ kind: "clock.overdue", person, since, mine: false }, true),
    ).toEqual({
      title: "המשמרת של יואב לוי תוקנה",
      body: `כניסה ביום שלישי ב-${ltr("08:00")}, בלי יציאה`,
    });
    expect(
      reminder(
        { kind: "clock.overdue", person, since: null, mine: true },
        true,
      ),
    ).toEqual({ title: kinds.clock.overdue.settledTitleMine });
  });

  it("say only their group with details kept off the lock screen", () => {
    const hidden = he.app.notifications.push.notice.hidden;
    const notice = pushNotice(
      {
        ...entry({
          kind: "clock.open",
          since: "2026-11-25T05:55:00.000Z",
          shiftEnd: null,
        }),
        group: "clock",
      },
      baseWording,
      "Asia/Jerusalem",
      { previews: false },
    );
    expect(notice.title).toBe(hidden.clock);
    expect(notice.body).toBeUndefined();
    expect(JSON.stringify(notice)).not.toContain("07:55");
  });
});

// Pay access given to the reader alone (payroll P3): who gave it is said only
// when it was the ConceptApp team, from the console, so nobody reads a
// stranger's grant as a colleague's. The owner's own needs no name.
describe("pay access's words on the phone", () => {
  const pay = he.app.notifications.kinds.access.pay_granted;
  const granted = (
    actor: NotificationEntry["actor"],
    settled = false,
  ): NotificationEntry => ({
    ...entry({ kind: "access.pay_granted" }, settled),
    actor,
    group: null,
    href: "/clock/pay",
  });

  it("says the ConceptApp team gave it from the console", () => {
    expect(
      pushWords(granted({ kind: "team" }), baseWording, "Asia/Jerusalem"),
    ).toEqual({ title: pay.title, body: `${pay.byTeam}\n${pay.note}` });
    expect(pay.byTeam).toContain("ConceptApp");
  });

  it("names nobody when the owner gave it", () => {
    for (const actor of [
      { kind: "member", name: "אורי הדגמה" },
      { kind: "former" },
      { kind: "unknown" },
    ] as const) {
      expect(pushWords(granted(actor), baseWording, "Asia/Jerusalem")).toEqual({
        title: pay.title,
        body: pay.note,
      });
    }
  });

  it("says once it was taken back, and nothing about who", () => {
    expect(
      pushWords(granted({ kind: "team" }, true), baseWording, "Asia/Jerusalem"),
    ).toEqual({ title: pay.settledTitle });
  });
});

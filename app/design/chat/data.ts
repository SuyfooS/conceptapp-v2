// Mock rows for the chat demo: Shiran's chats in the demo restaurant on its
// Tuesday morning, as she, the shift manager, reads them. They stand in for
// database rows (names, departments, what people wrote), so their Hebrew
// stays here rather than in messages/; the Hebrew-literal check in tooling/
// allows this file. Private chats are only hers: management reads every
// group, never anyone else's private chat.

import { instantIn } from "@domain/availability";
import type { ChatKind } from "@domain/chat";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { listPhotos } from "../list-photos";
import { business, staff, teamMembers, user } from "../shell/data";

export const chatDemoBusiness = business.name;
export const CHAT_DEMO_ZONE = ISRAEL_TIME_ZONE;
/** Tuesday 3 November 2026, 08:12 in Tel Aviv, as the lists demo. */
export const CHAT_DEMO_NOW = "2026-11-03T06:12:00.000Z";
export const CHAT_DEMO_TODAY = "2026-11-03";
/** Who reads the demo. */
export const CHAT_DEMO_READER = "shiran";

export type ChatDemoPerson = {
  id: string;
  name: string;
  /** What they do here, under their name. */
  line: string;
  photo: string | null;
};

const lines: Record<string, string> = {
  shiran: user.role,
  uri: "בעלים",
  ...Object.fromEntries(staff.map((s) => [s.id, s.role])),
};

export const chatDemoPeople: ChatDemoPerson[] = teamMembers.map((m) => ({
  id: m.userId,
  // Everyone in the demo wrote their name down.
  name: m.name ?? "",
  line: lines[m.userId] ?? "",
  photo: m.photo,
}));

const people = new Map(chatDemoPeople.map((p) => [p.id, p]));

export function chatDemoPerson(id: string): ChatDemoPerson | null {
  return people.get(id) ?? null;
}

export type ChatDemoMessage = {
  id: string;
  author: string;
  /** ISO instant. */
  at: string;
  /** Null once removed: by its author, or by management in a group. */
  body: string | null;
  removedBy?: "author" | "management";
  /** An announcement from management (C3). */
  kind?: "announcement";
  /** A picture sent with it (C4): an illustration, as a stored one would show. */
  photo?: string;
  /** Its picture is no longer kept (its days or the business's space took it). */
  fileGone?: boolean;
  /** A PDF sent with it (C5): its name and size, as a stored one would show. */
  pdf?: { name: string; size: number };
};

/** A group's pinned announcement (C3): which message, and who confirmed it when. */
export type ChatDemoPinned = {
  message: string;
  /** Who of the group confirmed it, and when. */
  confirmedBy: Record<string, string>;
};

export type ChatDemoConversation = {
  /** Its address under /design/chat. */
  id: string;
  kind: ChatKind;
  /** A department's name. The whole team's and a private chat's come from words and the person. */
  name?: string;
  /** A private chat: the other person. */
  person?: string;
  /** A group's people; management reads every group too. */
  members: string[];
  /** A department Shiran is in; the others she reads as management. */
  mine?: boolean;
  muted?: boolean;
  /** Its department was removed: read only. */
  closed?: boolean;
  /** Messages by others she hasn't read. */
  unread: number;
  /** A private chat: the other person read hers up to here. */
  seenUpTo?: string;
  messages: ChatDemoMessage[];
  /** How someone answers in the demo when Shiran writes. */
  reply?: { author: string; body: string };
  /** Its pinned announcement, waiting for Shiran's "קראתי" (C3). */
  pinned?: ChatDemoPinned;
};

const at = (day: string, time: string) =>
  instantIn(day, time, CHAT_DEMO_ZONE).toISOString();
const YESTERDAY = "2026-11-02";
const SUNDAY = "2026-11-01";

let next = 0;
const said = (
  author: string,
  day: string,
  time: string,
  body: string | null,
  removedBy?: ChatDemoMessage["removedBy"],
): ChatDemoMessage => {
  next += 1;
  return { id: `m${next}`, author, at: at(day, time), body, removedBy };
};

/** The owner's announcement in the whole team's group, pinned (C3). */
const announcement: ChatDemoMessage = {
  ...said(
    "uri",
    CHAT_DEMO_TODAY,
    "07:50",
    "מהשבוע הבא סוגרים את הקופה ב-22:00",
  ),
  kind: "announcement",
};

export const chatDemoConversations: ChatDemoConversation[] = [
  {
    id: "team",
    kind: "team",
    members: chatDemoPeople.map((p) => p.id),
    unread: 1,
    pinned: {
      message: announcement.id,
      confirmedBy: {
        noa: at(CHAT_DEMO_TODAY, "07:58"),
        itay: at(CHAT_DEMO_TODAY, "08:07"),
      },
    },
    messages: [
      said(
        "uri",
        YESTERDAY,
        "18:30",
        "תודה לכולם על היום. היה ערב עמוס, ועברנו אותו יפה",
      ),
      said("maya", YESTERDAY, "18:34", "תודה אורי"),
      said("noa", YESTERDAY, "18:36", "תודה, היה כיף"),
      announcement,
      said("shiran", CHAT_DEMO_TODAY, "08:05", "בוקר טוב. הספק מגיע ב-10:00"),
      said("itay", CHAT_DEMO_TODAY, "08:07", "אני כבר פה, אקבל אותו"),
    ],
    reply: { author: "omer", body: "תודה, ראיתי" },
  },
  {
    id: "floor",
    kind: "department",
    name: "אולם",
    members: ["shiran", "maya"],
    mine: true,
    unread: 0,
    messages: [],
    reply: { author: "maya", body: "מעולה, תודה" },
  },
  {
    id: "bar",
    kind: "department",
    name: "בר",
    members: ["shiran", "yoav"],
    mine: true,
    muted: true,
    unread: 2,
    messages: [
      said("yoav", CHAT_DEMO_TODAY, "07:55", "נגמרו הלימונים"),
      said(
        "yoav",
        CHAT_DEMO_TODAY,
        "07:58",
        "אני קופץ לשוק לפני הפתיחה, חוזר עד 9",
      ),
    ],
    reply: { author: "yoav", body: "סגור" },
  },
  {
    id: "kitchen",
    kind: "department",
    name: "מטבח",
    members: ["noa", "itay", "omer"],
    unread: 3,
    messages: [
      said("omer", YESTERDAY, "16:10", "מי סוגר היום את המטבח?"),
      said("itay", YESTERDAY, "16:12", "אני, עד 23:00"),
      said("omer", YESTERDAY, "16:20", null, "management"),
      said("noa", CHAT_DEMO_TODAY, "07:31", "בוקר טוב"),
      said(
        "noa",
        CHAT_DEMO_TODAY,
        "07:40",
        "המקרר השני לא מקרר. העברתי הכול לראשון",
      ),
      {
        ...said("noa", CHAT_DEMO_TODAY, "07:41", "ככה המטבח נראה עכשיו"),
        photo: listPhotos.kitchen,
      },
      said(
        "itay",
        CHAT_DEMO_TODAY,
        "07:52",
        "הזמנתי טכנאי, הוא מגיע בצהריים. הפרטים כאן: https://www.example.com/service",
      ),
      {
        ...said("omer", CHAT_DEMO_TODAY, "07:58", null),
        pdf: { name: "תפריט סתיו 2026.pdf", size: 2_516_582 },
      },
    ],
    reply: { author: "itay", body: "תודה שירן" },
  },
  {
    id: "desserts",
    kind: "department",
    name: "קינוחים",
    members: ["shira", "omer"],
    closed: true,
    unread: 0,
    messages: [
      {
        ...said("shira", "2026-10-14", "14:55", "התפריט של הקינוחים לשבוע"),
        fileGone: true,
      },
      said("shira", "2026-10-14", "15:00", "ממחר הקינוחים עוברים למטבח"),
      said("omer", "2026-10-14", "15:05", "קיבלתי"),
    ],
  },
  {
    id: "noa",
    kind: "direct",
    person: "noa",
    members: ["shiran", "noa"],
    unread: 2,
    seenUpTo: at(YESTERDAY, "19:05"),
    messages: [
      said(
        "noa",
        YESTERDAY,
        "18:40",
        "היי שירן, אפשר לשאול משהו על הסידור של שבוע הבא?",
      ),
      said("shiran", YESTERDAY, "18:42", "בטח, מה צריך?"),
      said(
        "noa",
        YESTERDAY,
        "18:43",
        "יש לי מבחן ביום חמישי בבוקר. אפשר להעביר אותי לערב?",
      ),
      said("shiran", YESTERDAY, "19:05", "אבדוק עם איתי ואחזור אלייך מחר"),
      said("noa", CHAT_DEMO_TODAY, "08:10", "בוקר טוב, הספקת לבדוק?"),
      said(
        "noa",
        CHAT_DEMO_TODAY,
        "08:11",
        "ואם לא, אפשר להחליף איתך את שישי?",
      ),
    ],
    reply: { author: "noa", body: "תודה רבה" },
  },
  {
    id: "yoav",
    kind: "direct",
    person: "yoav",
    members: ["shiran", "yoav"],
    unread: 0,
    seenUpTo: at(YESTERDAY, "21:40"),
    messages: [
      said("yoav", YESTERDAY, "21:30", "סגרתי את הקופה, הכול מסתדר"),
      said("shiran", YESTERDAY, "21:40", "תודה, ראיתי"),
    ],
    reply: { author: "yoav", body: "בכיף" },
  },
  {
    id: "maya",
    kind: "direct",
    person: "maya",
    members: ["shiran", "maya"],
    unread: 0,
    seenUpTo: at(SUNDAY, "19:40"),
    messages: [
      said("shiran", SUNDAY, "19:30", "מחר את בבוקר?"),
      said("maya", SUNDAY, "19:40", "כן, נתראה ב-8"),
    ],
    reply: { author: "maya", body: "אין בעיה" },
  },
];

/**
 * An earlier announcement of Shiran's in the kitchen's group, no longer
 * pinned (C3): /design/chat/announcements lists it under the pinned ones.
 */
export const chatDemoEarlierAnnouncement = {
  message: {
    id: "a-earlier",
    author: CHAT_DEMO_READER,
    at: at(SUNDAY, "09:00"),
    body: "תזכורת: ביום חמישי מגיעה ביקורת תברואה. מסדרים את המחסן עד רביעי בערב",
  },
  conversation: "kitchen",
};

/** What Shiran tried to send in `?state=failed`, when the network let her down. */
export const chatDemoFailed = "אחזור אלייך עד הצהריים";

/**
 * The PDF Shiran is sending in `?state=uploading` (part of it up) and
 * `?state=pdfFailed` (it didn't go), C5.
 */
export const chatDemoUpload = { name: "הזמנה לספק.pdf", size: 1_363_149 };

/**
 * A conversation of the demo, or a private chat with someone on the team
 * Shiran hasn't written to yet, which starts empty.
 */
export function chatDemoConversation(id: string): ChatDemoConversation | null {
  const found = chatDemoConversations.find((c) => c.id === id);
  if (found) return found;
  const person = people.get(id);
  if (!person || person.id === CHAT_DEMO_READER) return null;
  return {
    id,
    kind: "direct",
    person: id,
    members: [CHAT_DEMO_READER, id],
    unread: 0,
    messages: [],
    reply: { author: id, body: "היי, מה קורה?" },
  };
}

/** Every address the demo answers. */
export function chatDemoIds(): string[] {
  return [
    ...chatDemoConversations.map((c) => c.id),
    ...chatDemoPeople
      .map((p) => p.id)
      .filter(
        (id) =>
          id !== CHAT_DEMO_READER &&
          !chatDemoConversations.some((c) => c.id === id),
      ),
  ];
}

/** "1.11", for a row that last spoke before yesterday. */
export function chatDemoShortDate(day: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

/** "יום ראשון, 1 בנובמבר", for a divider before yesterday. */
export function chatDemoLongDate(day: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

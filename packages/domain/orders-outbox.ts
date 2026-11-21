import { z } from "zod";
import type { DraftLine } from "./order-screens";
import { choiceId, type Menu, menuSchema } from "./order-taking";
import {
  type MyOrders,
  ORDER_CAPS,
  roundTarget,
  type SentRound,
} from "./orders";
import {
  retriesSend,
  type SendBody,
  sendAnswer,
  sendBody,
} from "./orders-sync";

/**
 * Waiter mode's outbox (P7): the rounds a phone sent that haven't answered
 * yet, kept on the phone for each person in each business until they do.
 * The rules here are pure, so the engine in the app (outbox.ts) and its
 * tests follow one set: whose turn a kept round is, when it asks first,
 * what an answer means, and how long what is kept stays.
 */

/** A round that hasn't gone this long stops and asks before trying again. */
export const OUTBOX_ASK_MS = 10 * 60_000;

/** What isn't one's own stays this long untouched, then goes. */
export const OUTBOX_KEEP_MS = 16 * 3_600_000;

/** Where a kept round goes, to name it on any screen. */
export type OutboxWhere = { placeName: string | null; takeaway: number | null };

/** A round kept on the phone until it answers. */
export type OutboxRow = {
  /** The round's key: its id in the database once it lands. */
  key: string;
  user: string;
  business: string;
  /** The draft it left (`draftKey`). */
  draft: string;
  body: SendBody;
  /** Its lines as drafted, to put back on a refusal. */
  lines: DraftLine[];
  where: OutboxWhere;
  /** When it was sent first, by the phone's clock. */
  queuedAt: number;
  /** From when its ten minutes count: its first send, or the last "שליחה". */
  askFrom: number;
};

/** Who the page is for: only their rounds go, and only in their business. */
export type OutboxSession = {
  user: string;
  business: string;
  viewing: boolean;
};

const uuid = z.uuid();
const at = z.number().finite();

/** A draft line as the phone keeps it. */
export const draftLineSchema = z.object({
  id: z.string().min(1).max(64),
  item: uuid,
  quantity: z.int().min(1).max(ORDER_CAPS.quantity),
  note: z.string().max(ORDER_CAPS.note).nullable(),
  allergy: z.boolean(),
  held: z.boolean(),
  choices: z.array(z.object({ group: choiceId, option: choiceId })),
}) satisfies z.ZodType<DraftLine>;

export const outboxWhereSchema = z.object({
  placeName: z.string().max(200).nullable(),
  takeaway: z.int().min(0).nullable(),
}) satisfies z.ZodType<OutboxWhere>;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A kept round read back: its key, person and business are its body's. */
export const outboxRowSchema = z
  .object({
    key: uuid,
    user: uuid,
    business: uuid,
    draft: z.string().min(1).max(200),
    body: sendBody,
    lines: z.array(draftLineSchema),
    where: outboxWhereSchema,
    queuedAt: at,
    askFrom: at,
  })
  .refine(
    (row) =>
      same(row.key, row.body.key) &&
      same(row.user, row.body.user) &&
      same(row.business, row.body.business),
    "A row is its body's",
  ) satisfies z.ZodType<OutboxRow>;

/** Why a draft's last send was refused, kept with it until it is sent again. */
export type KeptRefusal = {
  ok: false;
  failure: string;
  items: string[];
  order: string | null;
  target: z.infer<typeof roundTarget>;
  /** Where its round went, to name it on any screen. */
  where?: OutboxWhere;
  /** Its screen showed it: no banner says it any more. */
  seen: boolean;
};

export const keptRefusalSchema = z.object({
  ok: z.literal(false),
  failure: z.string().max(40),
  items: z.array(uuid),
  order: uuid.nullable(),
  target: roundTarget,
  where: outboxWhereSchema.optional(),
  seen: z.boolean(),
}) satisfies z.ZodType<KeptRefusal>;

/** A draft as the phone keeps it, with the refusal of its last send. */
export type DraftRecord = {
  user: string;
  business: string;
  draft: string;
  lines: DraftLine[];
  refusal: KeptRefusal | null;
  at: number;
};

export const draftRecordSchema = z.object({
  user: uuid,
  business: uuid,
  draft: z.string().min(1).max(200),
  lines: z.array(draftLineSchema),
  refusal: keptRefusalSchema.nullable(),
  at,
}) satisfies z.ZodType<DraftRecord>;

/** The newest menu the phone heard, for the mode to open with at once. */
export type MenuRecord = {
  user: string;
  business: string;
  version: number;
  menu: Menu;
  at: number;
};

export const menuRecordSchema = z
  .object({
    user: uuid,
    business: uuid,
    version: z.int().min(0),
    menu: menuSchema,
    at,
  })
  .refine(
    (record) => record.version === record.menu.version,
    "Its version",
  ) satisfies z.ZodType<MenuRecord>;

/**
 * Whose turn a kept round is now: "send" for the session's person in the
 * session's business, not viewing; "ask" once it hasn't gone for ten
 * minutes since `askFrom` (the clock set back counts as fresh); "hold" for
 * anyone else, another business, or no session. A held round waits on the
 * phone for its own person: it is never sent under another's cookie.
 */
export function rowTurn(
  row: Pick<OutboxRow, "user" | "business" | "askFrom">,
  session: OutboxSession | null,
  now: number,
): "send" | "ask" | "hold" {
  if (
    !session ||
    session.viewing ||
    !same(row.user, session.user) ||
    !same(row.business, session.business)
  ) {
    return "hold";
  }
  return now - row.askFrom >= OUTBOX_ASK_MS ? "ask" : "send";
}

/** How long a kept round hasn't gone, in the question's words: minutes, then hours. */
export function askAge(
  row: Pick<OutboxRow, "queuedAt">,
  now: number,
): { unit: "minutes" | "hours"; count: number } {
  const minutes = Math.max(0, Math.floor((now - row.queuedAt) / 60_000));
  return minutes < 60
    ? { unit: "minutes", count: minutes }
    : { unit: "hours", count: Math.floor(minutes / 60) };
}

/** What a send's answer means for its kept round. */
export type SendVerdict =
  | { kind: "sent"; round: SentRound }
  | { kind: "refused"; failure: string; items: string[]; order: string | null }
  | { kind: "retry" }
  /** Signed out, or no longer in the business: the person's rounds go. */
  | { kind: "lost"; why: "signedOut" | "notMember" }
  /** The cookie is another person's now: their rounds wait. */
  | { kind: "person" };

/** The failure a send's status means when its body names none. */
export function failureOfStatus(status: number | null): string {
  if (status === 401) return "signedOut";
  if (status === 403) return "noAccess";
  if (status === 404) return "gone";
  if (status === 429) return "tooMany";
  return "failed";
}

/**
 * A send's answer, by its status and body: tried again while nothing came
 * back or the server failed on its way (`retriesSend`); the round; lost
 * when signed out or no longer a member; held for another person; else
 * refused, by the body's reason or the status's.
 */
export function sendVerdict(status: number | null, json: unknown): SendVerdict {
  if (retriesSend(status)) return { kind: "retry" };
  const parsed = sendAnswer.safeParse(json);
  if (parsed.success && parsed.data.ok) {
    return { kind: "sent", round: parsed.data.round };
  }
  const said = parsed.success && !parsed.data.ok ? parsed.data : null;
  if (status === 401 || said?.failure === "signedOut") {
    return { kind: "lost", why: "signedOut" };
  }
  if (said?.failure === "notMember") return { kind: "lost", why: "notMember" };
  if (said?.failure === "person") return { kind: "person" };
  return {
    kind: "refused",
    failure: said?.failure ?? failureOfStatus(status),
    items: said?.items ?? [],
    order: said?.order ?? null,
  };
}

/**
 * Whether a kept record stays, as the outbox opens: one's own rounds always
 * (past ten minutes they ask, never go silently); another person's rounds,
 * and every draft and menu, while touched within 16 hours.
 */
export function keepsRecord(
  kind: "row" | "draft" | "menu",
  record: { user: string; at: number },
  session: Pick<OutboxSession, "user"> | null,
  now: number,
): boolean {
  if (kind === "row" && session && same(record.user, session.user)) {
    return true;
  }
  return now - record.at < OUTBOX_KEEP_MS;
}

/** When a kept round was last touched: sent, or sent again. */
export const rowTouched = (row: Pick<OutboxRow, "queuedAt" | "askFrom">) =>
  Math.max(row.queuedAt, row.askFrom);

/**
 * The kept rounds that went already (a last send on leaving the app that
 * landed): those whose key is one of one's own rounds today, each with the
 * order it went to and that order's takeaway number, if it is one.
 */
export function sentAlready<R extends Pick<OutboxRow, "key">>(
  rows: readonly R[],
  mine: {
    rounds: readonly Pick<
      MyOrders["rounds"][number],
      "id" | "order" | "takeaway"
    >[];
  },
): { row: R; order: string; takeaway: number | null }[] {
  const rounds = new Map(
    mine.rounds.map((round) => [round.id.toLowerCase(), round]),
  );
  return rows.flatMap((row) => {
    const round = rounds.get(row.key.toLowerCase());
    return round
      ? [{ row, order: round.order, takeaway: round.takeaway ?? null }]
      : [];
  });
}

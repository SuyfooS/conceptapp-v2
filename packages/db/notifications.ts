import "server-only";
import { type DocumentCategory, isDocumentCategory } from "@domain/documents";
import {
  INBOX_PAGE_SIZE,
  type InboxCursor,
  type InboxPlace,
  inboxCursor,
  inboxPage,
  type NotificationChat,
  type NotificationLookups,
  type NotificationRow,
  notificationChats,
  notificationDocuments,
  notificationRefs,
  PHONE_ONLY_KINDS,
} from "@domain/notifications";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/**
 * A table the project doesn't have yet (PostgREST's PGRST205, or Postgres's
 * 42P01): code that reads notifications can ship before their migration
 * reaches a project, and shows none until then. Any other error still throws.
 */
export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

export type InboxPage = {
  /** Unread lines, newest first: all of them come before any read one. */
  unread: NotificationRow[];
  /** Lines already read, newest first, on what is left of the page. */
  earlier: NotificationRow[];
  /** The cursor of the next older page, or null at the start. */
  older: string | null;
  lookups: NotificationLookups;
};

const COLUMNS = "id, kind, params, actor_id, created_at, read_at, resolved_at";

// A chat's own lines reach the phone only (`inbox: false`): the Chat tab
// counts them. Quoted: PostgREST reads a dot in a list as its own syntax.
const PHONE_ONLY = `(${PHONE_ONLY_KINDS.map((kind) => `"${kind}"`).join(",")})`;

type Row = {
  id: string;
  kind: string;
  params: unknown;
  actor_id: string | null;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
};

const toRow = (row: Row): NotificationRow => ({
  id: row.id,
  kind: row.kind,
  params: row.params,
  actorId: row.actor_id,
  createdAt: row.created_at,
  readAt: row.read_at,
  resolvedAt: row.resolved_at,
});

/**
 * A page of the signed-in person's lines in a business, under RLS: only their
 * own, and only those still for them (their role, the modules that are on),
 * but a chat's own lines, which only the phone shows. Every unread line comes
 * first, a page at a time, then the read ones (`inboxPage`), so whatever the
 * bell counts is on some page. The names they point at are read the same way.
 */
export async function getInbox(
  businessId: string,
  userId: string,
  before: InboxCursor | null,
): Promise<InboxPage> {
  const supabase = await createClient();
  // One part of the lines, newest first, after `after` when given.
  const lines = (read: boolean, after: InboxPlace | null) => {
    let query = supabase
      .from("notifications")
      .select(COLUMNS)
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .not("kind", "in", PHONE_ONLY);
    query = read ? query.not("read_at", "is", null) : query.is("read_at", null);
    if (after) {
      query = query.or(
        `created_at.lt."${after.at}",and(created_at.eq."${after.at}",id.lt.${after.id})`,
      );
    }
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(INBOX_PAGE_SIZE + 1);
  };
  const [unreadResult, readResult] = await Promise.all([
    before?.part === "read" ? null : lines(false, before?.after ?? null),
    lines(true, before?.part === "read" ? before.after : null),
  ]);
  for (const result of [unreadResult, readResult]) {
    if (result?.error && !isMissingTable(result.error)) throw result.error;
  }
  const page = inboxPage(
    before,
    (unreadResult?.data ?? []).map(toRow),
    (readResult.data ?? []).map(toRow),
  );
  const { unread, earlier } = page;
  const older = page.older ? inboxCursor(page.older) : null;

  return {
    unread,
    earlier,
    older,
    lookups: await lookupsFor(supabase, businessId, [...unread, ...earlier], {
      documents: true,
    }),
  };
}

/**
 * The names the rows point at, read under the reader's own access: people,
 * and the groups chat lines name (a group the reader no longer reads, and its
 * department's name, stay unknown). For the inbox alone (`documents`), the
 * categories of the documents lines name, read from the documents themselves
 * under the same session (RLS: only a document the reader still reads, so
 * someone who lost pay access, or a recipient of a removed one, learns
 * nothing); a phone's lines never look one up, so no lock screen says
 * "אישור מחלה".
 */
async function lookupsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  rows: readonly NotificationRow[],
  read: { documents: boolean },
): Promise<NotificationLookups> {
  const people = notificationRefs(rows);
  const chatIds = notificationChats(rows);
  const documentIds = read.documents ? notificationDocuments(rows) : [];
  const [members, chats, documents] = await Promise.all([
    people.length
      ? supabase
          .from("memberships")
          .select("user_id, active, profiles (full_name)")
          .eq("business_id", businessId)
          .in("user_id", people)
      : null,
    chatIds.length
      ? supabase
          .from("chat_conversations")
          .select("id, kind, departments (name)")
          .eq("business_id", businessId)
          .in("id", chatIds)
      : null,
    documentIds.length
      ? supabase
          .from("documents")
          .select("id, category")
          .eq("business_id", businessId)
          .in("id", documentIds)
      : null,
  ]);
  if (members?.error) throw members.error;
  // Before the chat migration reaches a project there are no chats.
  if (chats?.error && !isMissingTable(chats.error)) throw chats.error;
  // Nor documents before C6's: the lines then say "a document" alone.
  if (documents?.error && !isMissingTable(documents.error)) {
    throw documents.error;
  }
  const categories = new Map<string, DocumentCategory>();
  for (const document of documents?.data ?? []) {
    if (isDocumentCategory(document.category)) {
      categories.set(document.id, document.category);
    }
  }
  const groups = new Map<string, NotificationChat>();
  for (const chat of chats?.data ?? []) {
    if (chat.kind === "team") groups.set(chat.id, { kind: "team" });
    if (chat.kind === "department") {
      groups.set(chat.id, {
        kind: "department",
        name: chat.departments?.name ?? null,
      });
    }
  }
  return {
    chats: groups,
    ...(read.documents ? { documents: categories } : {}),
    members: new Map(
      (members?.data ?? []).map((row) => [
        row.user_id,
        {
          active: row.active,
          name: row.profiles?.full_name?.trim() || null,
        },
      ]),
    ),
  };
}

/** Lines a phone asks about at most: enough to count them for the summary. */
export const PUSHED_LINES_READ = 50;

/**
 * What a phone shows (/push/inbox): the signed-in person's unread lines in the
 * business that went to their phones after `since`, newest first, under RLS,
 * so only lines still for them. When none is new (two pushes raced, and the
 * first fetch showed both), the latest one pushed, which the phone shows again
 * in place of itself. Never anything that wasn't pushed.
 */
export async function getPushedLines(
  businessId: string,
  userId: string,
  since: string,
  max: number,
): Promise<{
  lines: NotificationRow[];
  /** Whether `lines` is the latest one shown again, not something new. */
  again: boolean;
  lookups: NotificationLookups;
}> {
  const supabase = await createClient();
  const pushed = () =>
    supabase
      .from("notifications")
      .select(COLUMNS)
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .is("read_at", null)
      .in("push_state", ["sending", "sent"])
      .not("pushed_at", "is", null);
  const fresh = await pushed()
    .gt("pushed_at", since)
    .order("pushed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(max, 1), PUSHED_LINES_READ));
  if (fresh.error) {
    if (isMissingTable(fresh.error)) {
      return { lines: [], again: false, lookups: { members: new Map() } };
    }
    throw fresh.error;
  }
  let rows = (fresh.data ?? []).map(toRow);
  let again = false;
  if (rows.length === 0) {
    const latest = await pushed()
      .order("pushed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    if (latest.error) throw latest.error;
    rows = (latest.data ?? []).map(toRow);
    again = rows.length > 0;
  }
  return {
    lines: rows,
    again,
    // Never a document's category: the phone shows these lines.
    lookups: await lookupsFor(supabase, businessId, rows, { documents: false }),
  };
}

/**
 * One of the signed-in person's lines, under RLS, or null. With its params,
 * which say where a line about one thing (a list) leads, and when it was
 * settled, which can change where it leads (`linkFor`).
 */
export async function getNotification(id: string): Promise<{
  id: string;
  businessId: string;
  kind: string;
  params: unknown;
  resolvedAt: string | null;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, business_id, kind, params, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data
    ? {
        id: data.id,
        businessId: data.business_id,
        kind: data.kind,
        params: data.params,
        resolvedAt: data.resolved_at,
      }
    : null;
}

/**
 * `actorId` has read these of their lines in the business, or all of them
 * (`public.read_notifications`, with the secret key). Callers make sure the
 * actor is the signed-in person and not viewing as someone else. Returns how
 * many it marked; none before the migration reaches the project.
 */
export async function readNotifications(
  actorId: string,
  businessId: string,
  ids: string[] | null,
): Promise<number> {
  const { data, error } = await createAdminClient().rpc("read_notifications", {
    actor: actorId,
    business: businessId,
    ...(ids ? { ids } : {}),
  });
  if (error) {
    if (isMissingFunction(error)) return 0;
    throw error;
  }
  return data ?? 0;
}

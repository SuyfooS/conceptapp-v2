import "server-only";
import {
  INBOX_PAGE_SIZE,
  type InboxCursor,
  type InboxPlace,
  inboxCursor,
  inboxPage,
  type NotificationLookups,
  type NotificationRow,
  notificationRefs,
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
 * own, and only those still for them (their role, the modules that are on).
 * Every unread line comes first, a page at a time, then the read ones
 * (`inboxPage`), so whatever the bell counts is on some page. The names they
 * point at are read the same way.
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
      .eq("user_id", userId);
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

  const people = notificationRefs([...unread, ...earlier]);
  const members = people.length
    ? await supabase
        .from("memberships")
        .select("user_id, active, profiles (full_name)")
        .eq("business_id", businessId)
        .in("user_id", people)
    : null;
  if (members?.error) throw members.error;

  return {
    unread,
    earlier,
    older,
    lookups: {
      members: new Map(
        (members?.data ?? []).map((row) => [
          row.user_id,
          {
            active: row.active,
            name: row.profiles?.full_name?.trim() || null,
          },
        ]),
      ),
    },
  };
}

/** One of the signed-in person's lines, under RLS, or null. */
export async function getNotification(
  id: string,
): Promise<{ id: string; businessId: string; kind: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, business_id, kind")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data
    ? { id: data.id, businessId: data.business_id, kind: data.kind }
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

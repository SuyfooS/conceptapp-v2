import { CHAT_RULES } from "@domain/chat";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { manifest } from "./manifest";

/**
 * The chat settings the database falls back to (private.chat_settings, which
 * the send reads) are the manifest's defaults, which the screens show; and
 * Orel's defaults (§17 of the chat plan), each one function in the database,
 * are CHAT_RULES in @domain/chat. pgTAP can't read either, so this asks SQL.
 * Needs the local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}

describe("chat settings", () => {
  it("default in the database as in the manifest", async () => {
    // An id no business has: no settings at all.
    const [row] = await sql<{ settings: unknown }[]>`
      select private.chat_settings(gen_random_uuid()) as settings`;
    expect(row?.settings).toEqual(manifest.settings.parse({}));
  });

  it("let what a business set win, field by field", async () => {
    await sql
      .begin(async (tx) => {
        const [business] = await tx<{ id: string }[]>`
          insert into public.businesses (slug, name)
          values ('chat-settings-check', 'Chat settings check')
          returning id`;
        const id = business?.id ?? "";
        await tx`
          insert into public.business_modules (business_id, module_key, enabled, settings)
          values (${id}, 'chat', false, '{"teamGroupWho": "announcers"}')`;
        const [row] = await tx<{ settings: unknown }[]>`
          select private.chat_settings(${id}) as settings`;
        expect(row?.settings).toEqual({
          ...manifest.settings.parse({}),
          teamGroupWho: "announcers",
        });
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});

describe("chat rules", () => {
  it("are Orel's defaults in the database as in @domain/chat", async () => {
    const [row] = await sql<
      {
        history_from_joining: boolean;
        read_marks: boolean;
        demo_keep_minutes: number;
        demo_per_hour: number;
      }[]
    >`
      select private.chat_history_from_joining() as history_from_joining,
        private.chat_read_marks() as read_marks,
        (extract(epoch from private.chat_demo_keeps()) / 60)::integer as demo_keep_minutes,
        private.chat_demo_per_hour() as demo_per_hour`;
    expect({ ...row }).toEqual({
      history_from_joining: CHAT_RULES.historyFromJoining,
      read_marks: CHAT_RULES.readMarks,
      demo_keep_minutes: CHAT_RULES.demoKeepMinutes,
      demo_per_hour: CHAT_RULES.demoMessagesPerHour,
    });
  });
});

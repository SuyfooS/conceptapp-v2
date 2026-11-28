import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INVITE_DAYS } from "@domain/invites";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";
import {
  functionsInForce,
  MIGRATIONS,
  type Migration,
  migrationFiles,
  withoutComments,
} from "./role-checks";

/**
 * The words a worker reads (closing the pilot, PR 5). A worker is told who
 * does a job in words with no gender ("מי שבונה את הסידור", "מי שמאשר
 * שעות", "מי שמנהל את העסק"), never "המנהל", one man, and never a slash
 * form. The examples every business sees, whatever its template, name no
 * place only a restaurant has. The sign-in's "לא הגיע קוד?" is the same for
 * every number (sign-in-form.test.ts draws it for one with an account and
 * one without) and tells an invited person who never joined that the first
 * time is through their own link, which lasts as long as the database keeps
 * an invite open; the line above the code says one went only to a number
 * that joined, and the screen for someone on no business's team sends them
 * to that link first.
 */

type Tree = { [key: string]: string | Tree };

/** Every leaf as [dotted key, value]. */
function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value, `${prefix}${key}.`),
  );
}

const heLeaves = new Map(leaves(he as Tree));
const enLeaves = new Map(leaves(en as Tree));

/** The sentence at a key, or a failure naming it. */
function at(words: Map<string, string>, key: string): string {
  const sentence = words.get(key);
  expect(sentence, key).toBeTypeOf("string");
  return sentence ?? "";
}

/** A sentence's Hebrew words, a slash form kept as one ("מנהל/ת"). */
const hebrewWords = (sentence: string) => sentence.match(/[א-ת/]+/g) ?? [];

/** A sentence's English words, in lower case. */
const englishWords = (sentence: string) =>
  sentence.toLowerCase().match(/[a-z]+/g) ?? [];

/**
 * "The manager" or "to a manager", one man or one woman, with any letters
 * before it ("והמנהל", "שהמנהל", "מהמנהל"). Not the verb ("מי שמנהל"), not
 * the plural ("המנהלים"), and not a role's slash form.
 */
const THE_MANAGER = /^[ושכבמ]*[הל]מנהלת?$/;

/**
 * Any form of "manager" in a sentence, but the verb after "מי ש" ("מי שמנהל
 * את העסק", whoever runs the business), for the words a worker reads.
 */
const managerWords = (sentence: string) =>
  hebrewWords(sentence).filter(
    (word) => word.includes("מנהל") && word !== "שמנהל",
  );

/**
 * Places and people only a restaurant or a bar has. A long word with any
 * letters before it ("במטבח", "שהקופה"); a short one only after "ה" ("הבר",
 * "שהבר") or after "ו", "ב" and "ל" alone ("לבר", "ובמנה"), so "כבר"
 * (already), "שבר", "ממנה" (from her) and "שמנה" are none, and "למנות" (to
 * count) is none either.
 */
const RESTAURANT_ONLY =
  /^(?!למנות$)(?:[ושכלמבה]*(?:מטבח|קופה|מלצר|מלצרית|מלצרים|שולחן|שולחנות|ברמן|בריסטה|טבח)|(?:[ושכלמבה]*ה|[ובל]*)(?:בר|שף|מנה|מנות))$/;
const RESTAURANT_ONLY_EN = new Set([
  "bar",
  "kitchen",
  "till",
  "checkout",
  "waiter",
  "waitress",
  "table",
  "tables",
  "dish",
  "dishes",
  "chef",
  "barista",
]);

/**
 * The sentences a worker reads that named "the manager", or a manager, and
 * now say who does the job instead.
 */
const WORKER_KEYS = [
  "auth.signIn.noCode.body",
  "app.noBusiness.body",
  "app.home.hero.noShifts.body",
  "app.shifts.mine.empty",
  "app.availability.hero.stillCan",
  "app.availability.note",
  "app.clock.history.aManager",
  "app.pay.day.aManager",
  "app.orders.staleShift.body",
];

/** Examples every business sees, whatever its template. */
const EVERY_TEMPLATE_KEYS = [
  "app.manage.roles.addSheet.nameHint",
  "app.me.bio.placeholder",
  "app.manage.departments.subtitle",
  "app.manage.departments.empty",
];

describe("the words a worker reads", () => {
  it("never say the manager, one man or one woman, anywhere in the app", () => {
    const found = [...heLeaves].flatMap(([key, sentence]) =>
      hebrewWords(sentence)
        .filter((word) => THE_MANAGER.test(word))
        .map((word) => `${key}: ${word}`),
    );
    expect(found).toEqual([]);
  });

  it("tells the manager from the verb, the plural and the role's name", () => {
    for (const word of ["המנהל", "והמנהל", "שהמנהל", "למנהל", "מהמנהל"]) {
      expect(THE_MANAGER.test(word), word).toBe(true);
    }
    expect(THE_MANAGER.test("המנהלת")).toBe(true);
    for (const word of ["שמנהל", "המנהלים", "למנהלים", "מנהל/ת", "מנהל"]) {
      expect(THE_MANAGER.test(word), word).toBe(false);
    }
  });

  it("say who does the job, with no gender and no slash, where they named a manager", () => {
    for (const key of WORKER_KEYS) {
      const sentence = at(heLeaves, key);
      expect(managerWords(sentence), key).toEqual([]);
      expect(
        hebrewWords(sentence).filter((word) => word.includes("/")),
        key,
      ).toEqual([]);
      expect(
        englishWords(at(enLeaves, key)).filter((word) =>
          word.startsWith("manager"),
        ),
        key,
      ).toEqual([]);
    }
  });

  it("tell a manager from whoever runs something", () => {
    expect(managerWords("כדאי לדבר עם המנהל.")).toEqual(["המנהל"]);
    expect(managerWords("תוקן על ידי מנהל")).toEqual(["מנהל"]);
    expect(managerWords("בתפקיד מנהל/ת")).toEqual(["מנהל/ת"]);
    expect(managerWords("מי שמנהל את העסק יכול לשלוח הזמנה")).toEqual([]);
  });

  it("say no exclamation mark", () => {
    for (const key of [...WORKER_KEYS, ...EVERY_TEMPLATE_KEYS]) {
      expect(at(heLeaves, key), key).not.toContain("!");
      expect(at(enLeaves, key), key).not.toContain("!");
    }
  });
});

describe("the examples every business sees", () => {
  it("name no place only a restaurant has, in either language", () => {
    for (const key of EVERY_TEMPLATE_KEYS) {
      expect(
        hebrewWords(at(heLeaves, key)).filter((word) =>
          RESTAURANT_ONLY.test(word),
        ),
        key,
      ).toEqual([]);
      expect(
        englishWords(at(enLeaves, key)).filter((word) =>
          RESTAURANT_ONLY_EN.has(word),
        ),
        key,
      ).toEqual([]);
    }
  });

  it("finds a bar or a kitchen, with the letters before them", () => {
    for (const word of [
      "בר",
      "בבר",
      "הבר",
      "לבר",
      "שהבר",
      "מהבר",
      "השף",
      "המנות",
      "במנה",
      "מטבח",
      "במטבח",
      "בקופה",
      "בריסטה",
    ]) {
      expect(RESTAURANT_ONLY.test(word), word).toBe(true);
    }
  });

  it("finds none in a common word that ends like one", () => {
    for (const word of [
      "מחסן",
      "בקבלה",
      "ברחוב",
      "עבר",
      "כבר",
      "וכבר",
      "שכבר",
      "כשכבר",
      "ממנה",
      "שבר",
      "לשבר",
      "שמנה",
      "למנות",
    ]) {
      expect(RESTAURANT_ONLY.test(word), word).toBe(false);
    }
  });

  it("keep the kitchen and the bar for the menu's departments, which only waiter mode shows", () => {
    // Shown only while taking orders is on and lists are off
    // (departments-view.tsx, departments-editor.tsx).
    expect(at(heLeaves, "app.manage.departments.subtitleMenu")).toContain(
      "מטבח",
    );
    expect(at(heLeaves, "app.manage.departments.emptyMenu")).toContain("מטבח");
  });
});

/** Every migration, oldest first, with its text. */
const migrations = (): Migration[] =>
  migrationFiles().map((name) => ({
    name,
    sql: readFileSync(join(MIGRATIONS, name), "utf8"),
  }));

/** The days in an expiry from now, or NaN for one written any other way, so it is seen. */
const daysIn = (expiry: string | undefined) =>
  Number(
    /^now\(\)\s*\+\s*interval\s*'(\d+)\s+days?'$/i.exec(
      expiry?.trim() ?? "",
    )?.[1] ?? Number.NaN,
  );

/** From `at` to its statement's `;`, in `code` (comments blanked). */
function statementAt(code: string, at: number): string {
  const end = withoutComments(code, true).indexOf(";", at);
  return code.slice(at, end === -1 ? code.length : end);
}

/** The default of an invite's expiry, as `inviteDaysInForce` names it. */
const INVITE_DEFAULT = "public.invites.expires_at default";

/**
 * The days an invite stays open once every migration has run: the default
 * of `public.invites.expires_at` as the newest statement that sets it has it,
 * and each expiry an `update` or `insert` of `public.invites` writes in a
 * function as it runs (a link issued again). A version a later migration
 * replaces or drops is history, so the length can change; another table's
 * expiry is none of these, and a copy of another expiry
 * (`excluded.expires_at`) gives no length. An invite's expiry written any
 * other way (`interval '2 weeks'`, `make_interval`, an insert's own value)
 * counts as NaN days, so it fails rather than goes unseen.
 */
function inviteDaysInForce(
  all: readonly Migration[],
): { file: string; where: string; days: number }[] {
  const ordered = [...all].sort((a, b) => a.name.localeCompare(b.name));
  let column: { file: string; expiry: string | undefined } | undefined;
  for (const { name: file, sql } of ordered) {
    const code = withoutComments(sql);
    for (const table of code.matchAll(
      /\b(create|alter)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?public\.invites\b/gi,
    )) {
      const statement = statementAt(code, table.index ?? 0);
      if ((table[1] ?? "").toLowerCase() === "create") {
        column = {
          file,
          expiry:
            /(?:^|[(,])\s*expires_at\s+[^,;\n]*?\bdefault\s+([^,;\n]+)/im.exec(
              statement,
            )?.[1],
        };
        continue;
      }
      const altered =
        /\balter\s+(?:column\s+)?expires_at\s+(?:set\s+default\s+([^,;\n]+)|drop\s+default)/i.exec(
          statement,
        );
      if (altered) column = { file, expiry: altered[1] };
    }
  }
  const found = column
    ? [
        {
          file: column.file,
          where: INVITE_DEFAULT,
          days: daysIn(column.expiry),
        },
      ]
    : [];
  for (const { name, migration: file, text } of functionsInForce(ordered)) {
    for (const write of text.matchAll(
      /\b(update|insert\s+into)\s+public\.invites\b/gi,
    )) {
      const statement = statementAt(text, write.index ?? 0);
      const columns = /^insert\s+into\s+public\.invites\s*\(([^)]*)\)/i.exec(
        statement,
      )?.[1];
      if (columns && /\bexpires_at\b/i.test(columns)) {
        found.push({ file, where: name, days: Number.NaN });
      }
      for (const [, expiry = ""] of statement.matchAll(
        /(?<![\w.])expires_at\s*=\s*([^,;\n]+?)\s*(?=$|[,;\n]|\b(?:where|from|returning)\b)/gi,
      )) {
        if (/^[a-z_][\w.]*$/i.test(expiry)) continue;
        found.push({ file, where: name, days: daysIn(expiry) });
      }
    }
  }
  return found;
}

/** A migration made of lines. */
const migration = (name: string, ...lines: string[]): Migration => ({
  name,
  sql: lines.join("\n"),
});

describe("sign-in's line for when no code came", () => {
  it("sends someone who never joined to their own link, and to whoever invited them", () => {
    const body = at(heLeaves, "auth.signIn.noCode.body");
    expect(body).toContain("בפעם הראשונה נכנסים רק מהקישור האישי");
    expect(body).toContain("ממי שהזמין אותך");
    expect(body).toContain(`${INVITE_DAYS} יום`);
    const english = at(enLeaves, "auth.signIn.noCode.body");
    expect(english).toContain("personal link");
    expect(english).toContain("whoever invited you");
    expect(english).toContain(`${INVITE_DAYS} days`);
  });

  it("has nothing filled in, so every number reads it the same", () => {
    // Drawn on the code step whatever the number (sign-in-form.tsx), and
    // compared there for a number with an account and one without.
    for (const words of [heLeaves, enLeaves]) {
      const body = at(words, "auth.signIn.noCode.body");
      expect(body).not.toMatch(/[{<]/);
    }
  });

  it("gives the days an invite stays open in the database", () => {
    const found = inviteDaysInForce(migrations());
    expect(found.filter(({ where }) => where === INVITE_DEFAULT)).toHaveLength(
      1,
    );
    expect(found.filter(({ where }) => where !== INVITE_DEFAULT)).not.toEqual(
      [],
    );
    expect(found.filter(({ days }) => days !== INVITE_DAYS)).toEqual([]);
  });

  it("reads only the expiry in force, so a later migration can change it", () => {
    const found = inviteDaysInForce([
      migration(
        "2_shorter.sql",
        "alter table public.invites",
        "  alter column expires_at set default now() + interval '7 days';",
        "create or replace function public.invite_resend(invite uuid)",
        "returns void language sql as $$",
        "  update public.invites i",
        "  set token_hash = null,",
        "    expires_at = now() + interval '7 days'",
        "  where i.id = invite and i.expires_at > now();",
        "$$;",
        "drop function public.invite_old(uuid);",
      ),
      migration(
        "1_tenancy.sql",
        "create table public.invites (",
        "  id uuid primary key,",
        "  expires_at timestamptz not null default now() + interval '14 days',",
        "  token_hash text",
        ");",
        "create function public.invite_resend(invite uuid)",
        "returns void language sql as $$",
        "  update public.invites set expires_at = now() + interval '14 days' where id = invite;",
        "$$;",
        "create function public.invite_old(invite uuid)",
        "returns void language sql as $$",
        "  update public.invites set expires_at = now() + interval '14 days' where id = invite;",
        "$$;",
      ),
    ]);
    expect(found).toEqual([
      { file: "2_shorter.sql", where: INVITE_DEFAULT, days: 7 },
      { file: "2_shorter.sql", where: "public.invite_resend", days: 7 },
    ]);
  });

  it("counts no other table's expiry, nor a copy of another expiry", () => {
    const found = inviteDaysInForce([
      migration(
        "1_others.sql",
        "create table public.invites (",
        "  business_id uuid primary key,",
        "  expires_at timestamptz not null default now() + interval '14 days'",
        ");",
        "create table public.share_links (",
        "  expires_at timestamptz not null default now() + interval '30 days'",
        ");",
        "alter table public.share_links",
        "  alter column expires_at set default now() + interval '60 days';",
        "create function private.share(b uuid)",
        "returns void language plpgsql as $$",
        "begin",
        "  update public.share_links set expires_at = now() + interval '30 days' where business_id = b;",
        "  insert into public.invites (business_id) values (b)",
        "  on conflict (business_id) do update set expires_at = excluded.expires_at;",
        "end;",
        "$$;",
      ),
    ]);
    expect(found).toEqual([
      { file: "1_others.sql", where: INVITE_DEFAULT, days: 14 },
    ]);
  });

  it("sees an invite's expiry written another way", () => {
    const found = inviteDaysInForce([
      migration(
        "1_other_ways.sql",
        "create table public.invites (",
        "  business_id uuid primary key,",
        "  expires_at timestamptz not null default now() + make_interval(days => 14)",
        ");",
        "create function public.invite_resend(b uuid)",
        "returns void language sql as $$",
        "  update public.invites set expires_at = now() + interval '2 weeks' where business_id = b;",
        "$$;",
        "create function public.invite_add(b uuid, until timestamptz)",
        "returns void language sql as $$",
        "  insert into public.invites (business_id, expires_at) values (b, until);",
        "$$;",
      ),
    ]);
    expect(found).toEqual([
      { file: "1_other_ways.sql", where: INVITE_DEFAULT, days: Number.NaN },
      {
        file: "1_other_ways.sql",
        where: "public.invite_resend",
        days: Number.NaN,
      },
      {
        file: "1_other_ways.sql",
        where: "public.invite_add",
        days: Number.NaN,
      },
    ]);
  });
});

describe("sign-in's line above the code", () => {
  it("says a code went only to a number that joined, not to one only invited", () => {
    // Sign-in sends a code only to a number with an account, and only joining
    // makes one (otp.ts, join/actions.ts), so "added to a team" said a code
    // went to someone whose manager had only invited them.
    const intro = at(heLeaves, "auth.signIn.codeIntro");
    expect(intro).toContain("כבר הצטרפת לעסק");
    expect(intro).not.toContain("נוסף");
    const english = at(enLeaves, "auth.signIn.codeIntro");
    expect(english).toContain("already joined");
    expect(english).not.toContain("added");
  });
});

describe("the screen for someone signed in on no business's team", () => {
  // Joining makes the account as its code is sent, before it is typed in, so
  // someone whose invite is still open can sign in and land here: the link
  // comes first, and a new one only once there is none or it ran out.
  it("sends them to their own link first, then to whoever runs the business for a new one", () => {
    const body = at(heLeaves, "app.noBusiness.body");
    expect(body).toContain("עוד לא הצטרפת");
    expect(body).toContain("קישור אישי");
    expect(body).toContain(`${INVITE_DAYS} יום`);
    expect(body).toContain("ממי שמנהל את העסק");
    const english = at(enLeaves, "app.noBusiness.body");
    expect(english).toContain("haven't joined");
    expect(english).toContain("personal link");
    expect(english).toContain(`${INVITE_DAYS} days`);
    expect(english).toContain("whoever runs your business");
  });
});

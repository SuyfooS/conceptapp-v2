import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type postgres from "postgres";
import { describe, expect, it } from "vitest";
import { choice, choiceSql } from "./ids";
import { PARTS, readPart, runPart, stepFailure, stepsOf } from "./parts";
import { expectations, partData } from "./seed";
import { shape } from "./shape";

const ANCHOR = new Date("2026-11-17T09:20:00Z");

describe("the seed's SQL parts", () => {
  it("are every file of sql/, in order", () => {
    const files = readdirSync(join(__dirname, "sql"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    expect(files).toEqual([...PARTS]);
  });

  it("are single statements with no dollar quote or DO block", () => {
    for (const part of PARTS) {
      const steps = readPart(part);
      expect(steps.length, part).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.text, `${part} ${step.name}`).not.toMatch(/;\s*$/);
        expect(step.text).not.toContain("$$");
      }
    }
    expect(() => stepsOf("-- step: a\nselect 1;\nselect 2;", "x")).toThrow(
      /two statements/,
    );
    expect(() => stepsOf("-- step: a\nselect $$x$$", "x")).toThrow(
      /dollar quote/,
    );
    expect(() =>
      stepsOf("-- step: a\ndo language plpgsql 'begin end'", "x"),
    ).toThrow(/DO block/);
    expect(() =>
      stepsOf("-- step: a\nselect 1\n-- step: a\nselect 2", "x"),
    ).toThrow(/twice/);
  });

  it("each step that takes rows is given them by the seed, and nothing else is", () => {
    for (const depth of ["people", "history"] as const) {
      const data = partData(
        shape({
          people: 30,
          depth,
          months: 2,
          chat: "ci",
          anchor: ANCHOR,
          marginMinutes: 0,
        }),
      );
      for (const [part, steps] of Object.entries(data)) {
        const sql = readPart(part as (typeof PARTS)[number]);
        const names = new Set(sql.map((s) => s.name));
        for (const name of Object.keys(steps))
          expect(names.has(name), `${part} ${name}`).toBe(true);
        for (const step of sql) {
          if (step.takesRows)
            expect(steps[step.name], `${part} ${step.name}`).toBeDefined();
          else expect(steps[step.name], `${part} ${step.name}`).toBeUndefined();
        }
      }
    }
  });

  it("each column a step reads from its rows is one the seed sends", () => {
    const data = partData(
      shape({
        people: 30,
        depth: "history",
        months: 2,
        chat: "ci",
        anchor: ANCHOR,
        marginMinutes: 0,
      }),
    );
    for (const [part, steps] of Object.entries(data)) {
      for (const step of readPart(part as (typeof PARTS)[number])) {
        const rows = steps[step.name];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const first = rows[0];
        if (typeof first !== "object" || first === null) continue;
        // `as r (a type, b type, …)` right after jsonb_to_recordset($1::jsonb).
        const declared =
          /jsonb_to_recordset\(\$1::jsonb\)\s+as r \(([^)]*)\)/.exec(
            step.text,
          )?.[1];
        if (!declared) continue;
        const columns = declared
          .split(",")
          .map((c) => c.trim().split(/\s+/)[0] ?? "")
          .filter(Boolean);
        expect(Object.keys(first).sort(), `${part} ${step.name}`).toEqual(
          columns.sort(),
        );
      }
    }
  });

  it("an error names the part, the step and the line", () => {
    const [step] = stepsOf(
      "-- intro\n\n-- step: rows\nselect 1\nfrom nowhere",
      "92-weeks",
    );
    if (!step) throw new Error("no step");
    const error = stepFailure("92-weeks", step, {
      message: 'relation "nowhere" does not exist',
      code: "42P01",
      position: "15",
    });
    expect(error.message).toMatch(
      /92-weeks, step rows \(line 5 of 92-weeks\.sql\)/,
    );
    expect(error.message).toMatch(/code 42P01/);
  });

  it("sends a step's rows as a typed JSON parameter, so they are encoded once", async () => {
    // `$1::jsonb` makes postgres.js take the parameter as jsonb and encode
    // it: a string already encoded would arrive as a JSON string, which
    // jsonb_to_recordset refuses. tx.json(rows) is encoded once.
    const sent: unknown[][] = [];
    const tx = {
      json: (value: unknown) => ({ json: value }),
      unsafe: async (_text: string, parameters: unknown[] = []) => {
        sent.push(parameters);
        return [];
      },
    } as unknown as postgres.TransactionSql;
    const many = Array.from({ length: 2001 }, (_, i) => ({ id: String(i) }));
    await runPart(tx, "20-business", {
      businesses: many,
      templates: [],
      settings: [],
      departments: [],
      owners: [],
      named_role: [],
      role_edits_clock: [],
    });
    await runPart(tx, "90-log", { history: { businesses: ["b"] } });
    expect(sent).toEqual([
      [{ json: many.slice(0, 2000) }],
      [{ json: many.slice(2000) }],
      [{ json: { businesses: ["b"] } }],
    ]);
  });

  it("nothing in measure/ sends rows to SQL as JSON text cast to jsonb", () => {
    for (const file of readdirSync(__dirname).filter((f) =>
      f.endsWith(".ts"),
    )) {
      const text = readFileSync(join(__dirname, file), "utf8");
      expect(text, file).not.toMatch(/JSON\.stringify\([^)]*\)\}::jsonb/);
      expect(text, file).not.toMatch(/\[JSON\.stringify\(chunk\)\]/);
    }
  });

  it("every part is checked on the log's total, and on no line before 80-lines", () => {
    const s = shape({
      people: 30,
      depth: "history",
      months: 2,
      chat: "ci",
      anchor: ANCHOR,
    });
    const e = expectations(s);
    const at = (
      part: string,
      key: string,
      b: "scale" | "neighbour" = "scale",
    ) => e[part]?.[b][key];
    for (const part of Object.keys(e)) {
      expect(at(part, "log"), part).toBeTypeOf("number");
      expect(at(part, "log", "neighbour"), part).toBeTypeOf("number");
    }
    // A stray line or log row fails in the part that wrote it: only the
    // named role's two rows (role.create, role.permission) until the log.
    for (const part of [
      "20-business",
      "30-team",
      "50-hours",
      "60-chat",
      "70-documents",
    ]) {
      expect(e[part]?.scale, part).toMatchObject({
        log: 2,
        lines: 0,
        lines_pushing: 0,
      });
      expect(e[part]?.neighbour, part).toMatchObject({
        log: 0,
        lines: 0,
        lines_pushing: 0,
      });
    }
    expect(at("80-lines", "log")).toBe(2);
    // Then each part adds its own rows: the history's every action, the
    // publishing, the days away, the waiting entries' punches.
    const history = Object.entries(e["90-log"]?.scale ?? {})
      .filter(([key]) => key.startsWith("log_"))
      .reduce((sum, [, n]) => sum + n, 0);
    expect(at("90-log", "log")).toBe(2 + history);
    expect(at("92-weeks", "log")).toBe(
      (at("90-log", "log") ?? 0) +
        (at("92-weeks", "log_schedule_publish") ?? 0),
    );
    expect(at("93-absences", "log")).toBe(
      (at("92-weeks", "log") ?? 0) +
        (at("93-absences", "log_absence_add") ?? 0),
    );
    expect(at("95-waiting", "log")).toBeGreaterThan(
      at("93-absences", "log") ?? 0,
    );
  });

  it("the SQL choice reads md5 as the TypeScript one does", () => {
    // The text the database test's vector checks against choice(): the
    // version, kind, subject and day joined by ':', 8 hex digits, unsigned.
    expect(choiceSql("read", "'p'", "'2026-11-17'")).toBe(
      "(('x' || substr(md5(current_setting('scale.version') || ':read:' || 'p' || ':' || '2026-11-17'), 1, 8))::bit(32)::bigint / 4294967296.0)",
    );
    // 80-lines' read marks are that expression, written out.
    const flat = readFileSync(join(__dirname, "sql", "80-lines.sql"), "utf8")
      .replace(/\s+/g, " ")
      .replace(/\( /g, "(")
      .replace(/ \)/g, ")");
    const read = choiceSql(
      "read",
      "n.user_id::text",
      "to_char(n.created_at at time zone 'Asia/Jerusalem', 'YYYY-MM-DD')",
    );
    expect(flat).toContain(`${read.slice(1, -1)} < 0.7`);
    expect(choice("read", "p", "2026-11-17")).toBeLessThan(1);
  });
});

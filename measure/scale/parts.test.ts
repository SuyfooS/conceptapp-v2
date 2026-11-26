import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { choice, choiceSql } from "./ids";
import { PARTS, readPart, stepFailure, stepsOf } from "./parts";
import { partData } from "./seed";
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
      "40-weeks",
    );
    if (!step) throw new Error("no step");
    const error = stepFailure("40-weeks", step, {
      message: 'relation "nowhere" does not exist',
      code: "42P01",
      position: "15",
    });
    expect(error.message).toMatch(
      /40-weeks, step rows \(line 5 of 40-weeks\.sql\)/,
    );
    expect(error.message).toMatch(/code 42P01/);
  });

  it("the SQL choice reads md5 as the TypeScript one does", () => {
    const expression = choiceSql("read", "'p'", "'2026-11-17'");
    expect(expression).toContain("::bit(32)::bigint / 4294967296.0");
    const lines = readFileSync(join(__dirname, "sql", "80-lines.sql"), "utf8");
    expect(lines).toContain("current_setting('scale.version') || ':read:'");
    expect(choice("read", "p", "2026-11-17")).toBeLessThan(1);
  });
});

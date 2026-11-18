import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PL/pgSQL ends an IF's (or ELSIF's) condition at the first THEN outside
 * parentheses, so a CASE written bare inside the condition cuts it at the
 * CASE's own THEN: "syntax error at end of input", found only when the
 * migration runs (chat C4). A CASE in a condition goes in parentheses.
 */

const migrations = join(__dirname, "..", "supabase", "migrations");

/** The text with comments and string literals blanked, keeping offsets. */
function codeOnly(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      out += sql.slice(i, j + 1).replace(/[^\n]/g, " ");
      i = j + 1;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/** Each IF or ELSIF whose condition holds a CASE outside parentheses. */
function bareCaseInConditions(sql: string): number[] {
  const code = codeOnly(sql);
  const found: number[] = [];
  const opener = /\b(?<!end\s)(elsif|if)\b(?!\s+(not\s+)?exists\b)/gi;
  for (const match of code.matchAll(opener)) {
    let depth = 0;
    const words = /\(|\)|\b(then|case|loop)\b|;/gi;
    words.lastIndex = (match.index ?? 0) + match[0].length;
    for (let word = words.exec(code); word; word = words.exec(code)) {
      const token = word[0].toLowerCase();
      if (token === "(") depth += 1;
      else if (token === ")") depth -= 1;
      else if (depth > 0) continue;
      else if (token === "case") {
        found.push(code.slice(0, word.index).split("\n").length);
        break;
      } else break;
    }
  }
  return found;
}

describe("PL/pgSQL IF conditions", () => {
  it("finds a bare CASE, and lets one in parentheses or a call be", () => {
    expect(
      bareCaseInConditions(
        "if a > case when b then 1 else 2 end then\n  null;\nend if;",
      ),
    ).toEqual([1]);
    expect(
      bareCaseInConditions(
        "if a > (case when b then 1 else 2 end) then null; end if;\n" +
          "if f(x, case when b then 1 end) then null; end if;\n" +
          "-- if a > case when b then 1 end then\n" +
          "if a = 'case when' then null; end if;\n" +
          "drop function if exists f;",
      ),
    ).toEqual([]);
  });

  it("no migration has one", () => {
    const found = readdirSync(migrations)
      .filter((name) => name.endsWith(".sql"))
      .flatMap((name) =>
        bareCaseInConditions(readFileSync(join(migrations, name), "utf8")).map(
          (line) => `${name}:${line}`,
        ),
      );
    expect(found).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// packages/db/database.types.ts is what `pnpm db:types` prints, and CI's
// database job fails on any difference. Without Docker it is written by
// hand, and Biome keeps an object laid out as it finds it, so `pnpm check`
// can't tell a hand-expanded entry from the generator's (H4's review found
// ten). This does, for the functions: the generator puts `Args` on one line
// whenever that fits in 80 columns, and a whole entry (`name: { Args: …;
// Returns: … };`) whenever that fits. A table's Returns, like Row, Insert
// and Update, is always expanded.

const WIDTH = 80;
const root = join(__dirname, "..");

type Entry = { name: string; line: number; body: string[] };

/** Each function written over several lines: its name, line and inner lines. */
function functionEntries(source: string): Entry[] {
  const lines = source.split("\n");
  const entries: Entry[] = [];
  let inFunctions = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line === "    Functions: {") {
      inFunctions = true;
      continue;
    }
    if (!inFunctions) continue;
    if (line === "    };") {
      inFunctions = false;
      continue;
    }
    const head = /^ {6}([a-z0-9_]+): \{$/.exec(line);
    if (!head) continue;
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j] !== "      };") {
      body.push(lines[j] ?? "");
      j++;
    }
    entries.push({ name: head[1] ?? "", line: i + 1, body });
    i = j;
  }
  return entries;
}

/** Why the generator would print this entry otherwise, or null. */
function misprinted(entry: Entry): string | null {
  const start = entry.body.findIndex((l) => l.startsWith("        Args:"));
  if (start < 0) return null;
  const first = entry.body[start] ?? "";
  let args = first.trim().replace(/;$/, "");
  let end = start;
  if (first === "        Args: {") {
    const parts: string[] = [];
    end = start + 1;
    while (end < entry.body.length && entry.body[end] !== "        };") {
      parts.push((entry.body[end] ?? "").trim());
      end++;
    }
    // Only plain `name?: type;` lines can go on one line.
    if (!parts.every((p) => /^[a-z0-9_]+\??: [^{|]+;$/.test(p))) return null;
    args = `Args: { ${parts.map((p) => p.slice(0, -1)).join("; ")} }`;
    if (`        ${args};`.length <= WIDTH) {
      return `${entry.name} (line ${entry.line}): Args fit on one line`;
    }
  }
  const rest = entry.body.slice(end + 1);
  const [returns] = rest;
  if (rest.length === 1 && returns && /^ {8}Returns: [^{]*;$/.test(returns)) {
    const whole = `      ${entry.name}: { ${args}; ${returns.trim().slice(0, -1)} };`;
    if (whole.length <= WIDTH) {
      return `${entry.name} (line ${entry.line}): the entry fits on one line`;
    }
  }
  return null;
}

describe("database.types.ts", () => {
  it("lays its functions out as the generator does", () => {
    const source = readFileSync(
      join(root, "packages/db/database.types.ts"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const entries = functionEntries(source);
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.map(misprinted).filter(Boolean)).toEqual([]);
  });

  it("tells a hand-expanded entry from the generator's", () => {
    const source = [
      "    Functions: {",
      "      short_args: {",
      "        Args: {",
      "          business: string;",
      "          person: string;",
      "        };",
      "        Returns: {",
      "          user_id: string;",
      "        }[];",
      "      };",
      "      no_args: {",
      "        Args: Record<PropertyKey, never>;",
      "        Returns: Json;",
      "      };",
      "      as_printed: {",
      "        Args: { actor: string; at_time?: string; business: string };",
      "        Returns: undefined;",
      "      };",
      "      long_args: {",
      "        Args: {",
      "          actor: string;",
      "          at_time?: string;",
      "          business: string;",
      "          person: string;",
      "        };",
      "        Returns: Json;",
      "      };",
      "    };",
    ].join("\n");
    expect(functionEntries(source).map(misprinted)).toEqual([
      "short_args (line 2): Args fit on one line",
      "no_args (line 11): the entry fits on one line",
      null,
      null,
    ]);
  });
});

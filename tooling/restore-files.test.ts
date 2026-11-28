import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BackupError,
  BUCKETS,
  backup,
  CI_REFUSAL,
  LOCAL_API,
  MANIFEST_FORMAT,
  openBackup,
  REPO_ROOT,
  StorageError,
  writeBackup,
} from "./backup-files.mjs";
import { answers, fakeStorage, lines } from "./fake-storage";
import {
  heldLines,
  main,
  restoreInto,
  targetOrigin,
  targetRefusal,
} from "./restore-files.mjs";

// tooling/restore-files.mjs, the restore drill of docs/production.md, B8
// (closing the pilot, PR 20). Never against a real project: the target is
// the in-memory stand-in of ./fake-storage. What it keeps: the backup read
// to its end and every SHA-256 checked before any question about a project;
// a project typed twice, never conceptapp-dev's, production's or the one the
// backup came from, and the local stack only for a backup of it; the app's
// buckets there, a hosted one that knows the backup's files (whatever ref
// was typed), and nothing overwritten unless asked; each upload only after
// its file matched the first reading; counts on the screen, never a file's
// name or the key, and "maybe some went up" only once one did. Node 20, too.

const FAST = { N: 2 ** 14, r: 8, p: 1 };
const PASSPHRASE = "correct horse battery staple";
const SECRET = "sb_secret_TEST_ONLY_not_a_real_key";
const SOURCE = "prodprodprodprodprod";
const DEV = "devdevdevdevdevdevde";
const TEMP = "temptemptemptemptemp";
const NOW = new Date(2026, 10, 28, 9, 5);

const SEED = {
  avatars: { "u-1/a.jpg": "avatar" },
  "list-photos": { "b-1/l-1/i.jpg": "list photo", "b-1/l-1/j.jpg": "another" },
  documents: { "b-1/p-1/note.pdf": "%PDF-1.7 note" },
};
const PATHS = Object.values(SEED).flatMap((files) => Object.keys(files));

/**
 * A temporary project restored from the database's backup, as the drill
 * makes it: every file's row (listed), none of the files themselves.
 */
const restoredCopy = (options: Parameters<typeof fakeStorage>[1] = {}) =>
  fakeStorage(
    Object.fromEntries(
      Object.entries(SEED).map(([bucket, files]) => [
        bucket,
        Object.fromEntries(
          Object.keys(files).map((path) => [path, "a row with no file"]),
        ),
      ]),
    ),
    options,
  );

const made: string[] = [];
afterEach(() => {
  for (const folder of made.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** A backup of SEED (or `seed`), made by the backup itself, and the folder it is in. */
async function aBackup(
  source = SOURCE,
  seed: Parameters<typeof fakeStorage>[0] = SEED,
) {
  const parent = mkdtempSync(join(tmpdir(), "restore-files-test-"));
  made.push(parent);
  const { file } = await backup({
    client: fakeStorage(seed),
    source,
    parent,
    passphrase: PASSPHRASE,
    now: NOW,
    out: lines().out,
    kdf: FAST,
    staging: parent,
  });
  return { file, parent };
}

describe("the project it writes to", () => {
  const refused = { source: SOURCE, dev: DEV, prod: "" };

  it("is typed twice, the same both times", () => {
    expect(targetRefusal(TEMP, TEMP, refused)).toBeNull();
    expect(targetRefusal(` ${TEMP}`, `${TEMP} `, refused)).toBeNull();
    expect(targetRefusal(TEMP, `${TEMP.slice(0, -1)}x`, refused)).toBe("twice");
  });

  it("is a ref, or the local stack", () => {
    expect(targetRefusal("Temp", "Temp", refused)).toBe("shape");
    expect(targetRefusal("", "", refused)).toBe("shape");
    expect(
      targetRefusal(
        `https://${TEMP}.supabase.co`,
        `https://${TEMP}.supabase.co`,
        refused,
      ),
    ).toBe("shape");
    expect(targetOrigin("local")).toBe(LOCAL_API);
    expect(targetOrigin(TEMP)).toBe(`https://${TEMP}.supabase.co`);
  });

  it("is never conceptapp-dev, production when named, or where the backup came from", () => {
    expect(targetRefusal(DEV, DEV, refused)).toBe("dev");
    expect(targetRefusal(TEMP, TEMP, { ...refused, prod: TEMP })).toBe("prod");
    expect(targetRefusal(SOURCE, SOURCE, refused)).toBe("source");
    // A backup of the local stack goes back into it, for the demo; a real
    // project's never goes to the computer where sessions and tests run.
    expect(
      targetRefusal("local", "local", { ...refused, source: "local" }),
    ).toBeNull();
    expect(targetRefusal("local", "local", refused)).toBe("local");
  });

  it("is only the local stack for a backup of it, with no other ref asked", () => {
    // The command asks neither conceptapp-dev's ref nor production's for a
    // backup of the local stack, so no hosted project may be typed for it.
    const fromLocal = { source: "local", dev: "", prod: "" };
    expect(targetRefusal("local", "local", fromLocal)).toBeNull();
    for (const typed of [TEMP, DEV, SOURCE, "Temp", ""]) {
      expect(targetRefusal(typed, typed, fromLocal), typed).toBe("hosted");
    }
    expect(targetRefusal("local", "locla", fromLocal)).toBe("twice");
  });
});

describe("a restore", () => {
  it("uploads every file, the same bytes, type and cache, without overwriting", async () => {
    const { file } = await aBackup();
    const opened = await openBackup(file, PASSPHRASE);
    const target = fakeStorage();
    const result = await restoreInto({
      client: target,
      file,
      passphrase: PASSPHRASE,
      opened,
      overwrite: false,
    });
    // Every bucket counted, chat-files with no file in the backup too.
    expect(result).toEqual({
      refused: null,
      sent: [
        { bucket: "avatars", uploaded: 1, failed: 0 },
        { bucket: "list-photos", uploaded: 2, failed: 0 },
        { bucket: "chat-files", uploaded: 0, failed: 0 },
        { bucket: "documents", uploaded: 1, failed: 0 },
      ],
    });
    for (const [bucket, files] of Object.entries(SEED)) {
      for (const [path, text] of Object.entries(files)) {
        expect(target.text(bucket, path), path).toBe(text);
      }
    }
    const uploads = target.calls.filter((call) => call.kind === "upload");
    expect(uploads).toContainEqual({
      kind: "upload",
      bucket: "documents",
      path: "b-1/p-1/note.pdf",
      contentType: "application/pdf",
      cacheControl: "max-age=3600",
      upsert: false,
    });
    expect(uploads.every((call) => call.upsert === false)).toBe(true);
  });

  it("stops before the first upload when a file is already there, unless asked to overwrite", async () => {
    const { file } = await aBackup();
    const opened = await openBackup(file, PASSPHRASE);
    const target = fakeStorage({
      documents: { "b-1/p-1/note.pdf": "a row with no file" },
      avatars: { "u-1/a.jpg": "old" },
    });
    expect(
      await restoreInto({
        client: target,
        file,
        passphrase: PASSPHRASE,
        opened,
        overwrite: false,
      }),
    ).toEqual({ refused: "exists", existing: 2 });
    expect(target.calls.some((call) => call.kind === "upload")).toBe(false);
    expect(target.text("avatars", "u-1/a.jpg")).toBe("old");

    const again = await restoreInto({
      client: target,
      file,
      passphrase: PASSPHRASE,
      opened,
      overwrite: true,
    });
    expect(again.refused).toBeNull();
    expect(target.text("avatars", "u-1/a.jpg")).toBe("avatar");
    expect(target.text("documents", "b-1/p-1/note.pdf")).toBe("%PDF-1.7 note");
    expect(
      target.calls
        .filter((call) => call.kind === "upload")
        .every((call) => call.upsert === true),
    ).toBe(true);
  });

  it("refuses a hosted project that knows none of the backup's files, even with overwrite", async () => {
    // conceptapp-dev, typed by mistake as the temporary project: the app's
    // buckets, none of production's paths. A copy restored from the
    // database's backup lists them all.
    const { file } = await aBackup();
    const opened = await openBackup(file, PASSPHRASE);
    const dev = fakeStorage({ avatars: { "demo-person/a.jpg": "demo" } });
    const progress = { uploads: 0 };
    expect(
      await restoreInto({
        client: dev,
        file,
        passphrase: PASSPHRASE,
        opened,
        overwrite: true,
        mustKnow: true,
        progress,
      }),
    ).toEqual({ refused: "unrelated" });
    expect(dev.calls.some((call) => call.kind === "upload")).toBe(false);
    expect(progress.uploads).toBe(0);
    // The copy the drill makes goes ahead, and counts what it began.
    const copy = restoredCopy();
    const restored = await restoreInto({
      client: copy,
      file,
      passphrase: PASSPHRASE,
      opened,
      overwrite: true,
      mustKnow: true,
      progress,
    });
    expect(restored.refused).toBeNull();
    expect(progress.uploads).toBe(PATHS.length);
    expect(copy.text("documents", "b-1/p-1/note.pdf")).toBe("%PDF-1.7 note");
  });

  it("refuses a project without the app's buckets, uploading nothing", async () => {
    const { file } = await aBackup();
    const opened = await openBackup(file, PASSPHRASE);
    const target = fakeStorage({}, { buckets: ["avatars", "list-photos"] });
    expect(
      await restoreInto({
        client: target,
        file,
        passphrase: PASSPHRASE,
        opened,
        overwrite: false,
      }),
    ).toEqual({ refused: "buckets", bucket: "documents" });
    expect(target.calls.some((call) => call.kind === "upload")).toBe(false);
  });

  it("counts a file that won't upload and goes on with the rest", async () => {
    const { file } = await aBackup();
    const opened = await openBackup(file, PASSPHRASE);
    const target = fakeStorage(
      {},
      { uploadFails: { "list-photos/b-1/l-1/i.jpg": 400 } },
    );
    const result = await restoreInto({
      client: target,
      file,
      passphrase: PASSPHRASE,
      opened,
      overwrite: false,
    });
    expect(result).toMatchObject({
      refused: null,
      sent: [
        { bucket: "avatars", uploaded: 1, failed: 0 },
        { bucket: "list-photos", uploaded: 1, failed: 1 },
        { bucket: "chat-files", uploaded: 0, failed: 0 },
        { bucket: "documents", uploaded: 1, failed: 0 },
      ],
    });
  });

  it("uploads nothing when the file changed after its first reading", async () => {
    const one = await aBackup();
    const opened = await openBackup(one.file, PASSPHRASE);
    // Another backup, whole and with the same passphrase, put in its place.
    const other = await aBackup("otherotherotherother");
    copyFileSync(other.file, one.file);
    const target = fakeStorage();
    await expect(
      restoreInto({
        client: target,
        file: one.file,
        passphrase: PASSPHRASE,
        opened,
        overwrite: false,
      }),
    ).rejects.toEqual(new BackupError("damaged"));
    expect(target.calls.some((call) => call.kind === "upload")).toBe(false);
  });

  it("says what the backup holds in counts, by bucket, and what it lacks", async () => {
    const { file } = await aBackup();
    const { manifest } = await openBackup(file, PASSPHRASE);
    const held = heldLines({
      ...manifest,
      missing: [{ bucket: "avatars", path: "u-2/b.jpg" }],
    });
    expect(held[0]).toBe(
      "[v] הגיבוי נפתח ונבדק עד הסוף: 4 קבצים (36 B), כל אחד לפי ה-SHA-256 שלו. הוא מ-28.11.2026 בשעה 09:05.",
    );
    expect(held.slice(1, 1 + BUCKETS.length)).toEqual([
      "    avatars: קובץ אחד (6 B)",
      "    list-photos: 2 קבצים (17 B)",
      "    chat-files: 0 קבצים (0 B)",
      "    documents: קובץ אחד (13 B)",
    ]);
    expect(held.at(-1)).toBe(
      "[i] קובץ אחד לא ירד בזמן הגיבוי, ולכן הוא לא בו.",
    );
    expect(held.join("\n")).not.toMatch(/u-1|u-2|b-1/);
  });
});

describe("the command", () => {
  async function run(
    args: string[],
    visible: string[],
    hidden: string[],
    {
      env = {},
      target = fakeStorage(),
    }: {
      env?: Record<string, string>;
      target?: ReturnType<typeof fakeStorage>;
    } = {},
  ) {
    const printed = lines();
    const shown = answers(...visible);
    const secret = answers(...hidden);
    const clients: { origin: string; key: string }[] = [];
    const code = await main(args, {
      env,
      out: printed.out,
      ask: shown.ask,
      askSecret: secret.ask,
      client: (origin: string, key: string) => {
        clients.push({ origin, key });
        return target;
      },
    });
    return { code, printed, shown, secret, clients, target };
  }

  it("checks the backup, asks for the project twice and its key hidden, and uploads", async () => {
    const { file } = await aBackup();
    const { code, printed, shown, secret, clients, target } = await run(
      [file, "--overwrite"],
      [DEV, "", TEMP, TEMP],
      [PASSPHRASE, SECRET],
      { target: restoredCopy() },
    );
    expect(code).toBe(0);
    expect(shown.asked).toHaveLength(4);
    expect(secret.asked).toHaveLength(2);
    expect(clients).toEqual([
      { origin: `https://${TEMP}.supabase.co`, key: SECRET },
    ]);
    expect(target.text("documents", "b-1/p-1/note.pdf")).toBe("%PDF-1.7 note");
    const text = printed.text();
    expect(text).toContain("[v] list-photos: 2 קבצים עלו");
    for (const hiddenWord of [SECRET, PASSPHRASE, ...PATHS]) {
      expect(text).not.toContain(hiddenWord);
    }
  });

  it("restores a backup of the local stack to `local`, asking no other ref", async () => {
    // The README's demo: a backup of http://127.0.0.1:54321, restored to
    // `local`, with no made-up ref typed for conceptapp-dev first.
    const { file } = await aBackup("local");
    const { code, printed, shown, secret, clients, target } = await run(
      [file],
      ["local", "local"],
      [PASSPHRASE, SECRET],
    );
    expect(code).toBe(0);
    expect(shown.asked).toHaveLength(2);
    expect(shown.asked.join("\n")).not.toMatch(/conceptapp-(dev|prod)/);
    expect(secret.asked).toHaveLength(2);
    expect(clients).toEqual([{ origin: LOCAL_API, key: SECRET }]);
    expect(target.text("avatars", "u-1/a.jpg")).toBe("avatar");
    expect(printed.text()).toContain("מקלידים local");
    expect(printed.written.at(-1)).toContain("הכול עלה");
  });

  it("refuses any hosted project for a backup of the local stack, asking no key", async () => {
    const { file } = await aBackup("local");
    for (const typed of [TEMP, DEV]) {
      const { code, printed, secret, clients } = await run(
        [file, "--overwrite"],
        [typed, typed],
        [PASSPHRASE],
        { target: restoredCopy() },
      );
      expect(code, typed).toBe(2);
      expect(clients).toEqual([]);
      expect(secret.asked).toHaveLength(1);
      expect(printed.written.at(-1)).toBe(
        "זה גיבוי של הפרויקט המקומי, והוא חוזר רק אליו: מקלידים local. לא עלה כלום.",
      );
    }
  });

  it("says each bucket's count after the uploads, 0 too, as B8 step 4.4 checks", async () => {
    // The first drill, before the business: no file in any bucket yet.
    const empty = await aBackup(SOURCE, {});
    const first = await run(
      [empty.file, "--overwrite"],
      [DEV, "", TEMP, TEMP],
      [PASSPHRASE, SECRET],
    );
    expect(first.code).toBe(0);
    const after = first.printed.written.slice(-1 - BUCKETS.length);
    expect(after).toEqual([
      ...BUCKETS.map((bucket) => `[v] ${bucket}: 0 קבצים עלו`),
      "הכול עלה, כל קובץ אחרי שה-SHA-256 שלו נבדק.",
    ]);
    // The second: files in three buckets, and chat-files still has its line.
    const { file } = await aBackup();
    const second = await run(
      [file, "--overwrite"],
      [DEV, "", TEMP, TEMP],
      [PASSPHRASE, SECRET],
      { target: restoredCopy() },
    );
    expect(second.code).toBe(0);
    expect(second.printed.written.slice(-1 - BUCKETS.length, -1)).toEqual([
      "[v] avatars: קובץ אחד עלה",
      "[v] list-photos: 2 קבצים עלו",
      "[v] chat-files: 0 קבצים עלו",
      "[v] documents: קובץ אחד עלה",
    ]);
  });

  it("asks nothing about a project when the backup doesn't open", async () => {
    const { file } = await aBackup();
    const { code, printed, shown, clients } = await run(
      [file],
      [],
      ["not the passphrase at all"],
    );
    expect(code).toBe(1);
    expect(shown.asked).toEqual([]);
    expect(clients).toEqual([]);
    expect(printed.text()).toContain("הסיסמה לא פותחת את הקובץ");
  });

  it("asks nothing about a project when a file doesn't match its SHA-256", async () => {
    const parent = mkdtempSync(join(tmpdir(), "restore-files-test-"));
    made.push(parent);
    const file = join(parent, "lying.backup");
    await writeBackup(
      file,
      {
        format: MANIFEST_FORMAT,
        version: 1,
        createdAt: NOW.toISOString(),
        source: SOURCE,
        buckets: [],
        objects: [
          {
            bucket: "avatars",
            path: "u/a.jpg",
            size: 4,
            contentType: "image/jpeg",
            cacheControl: "max-age=3600",
            sha256: "0".repeat(64),
          },
        ],
        missing: [],
      },
      async () => new TextEncoder().encode("abcd"),
      PASSPHRASE,
      { kdf: FAST },
    );
    const { code, printed, shown, clients } = await run(
      [file],
      [],
      [PASSPHRASE],
    );
    expect(code).toBe(1);
    expect(shown.asked).toEqual([]);
    expect(clients).toEqual([]);
    expect(printed.text()).toContain("SHA-256");
  });

  it("refuses conceptapp-dev, production, the backup's own project, the local stack and two typings that differ", async () => {
    const { file } = await aBackup();
    for (const visible of [
      [DEV, "", DEV, DEV],
      [DEV, TEMP, TEMP, TEMP],
      [DEV, "", SOURCE, SOURCE],
      [DEV, "", "local", "local"],
      [DEV, "", TEMP, `${TEMP.slice(0, -1)}x`],
      ["not-a-ref"],
    ]) {
      const { code, clients, secret } = await run([file], visible, [
        PASSPHRASE,
      ]);
      expect(code, visible.join(" ")).toBe(2);
      expect(clients).toEqual([]);
      // The project's key is never asked for a project refused.
      expect(secret.asked).toHaveLength(1);
    }
  });

  it("uploads nothing to a project that knows none of the files, whatever was typed for conceptapp-dev", async () => {
    // A wrong answer at dev's question, then dev's real ref as the temporary
    // project and dev's key, with --overwrite as the drill runs it.
    const { file } = await aBackup();
    const dev = fakeStorage({ avatars: { "demo-person/a.jpg": "demo" } });
    const { code, printed } = await run(
      [file, "--overwrite"],
      ["wrongwrongwrongwrong", "", DEV, DEV],
      [PASSPHRASE, SECRET],
      { target: dev },
    );
    expect(code).toBe(2);
    expect(dev.calls.some((call) => call.kind === "upload")).toBe(false);
    expect(printed.written.at(-1)).toContain(
      "הפרויקט הזה לא מכיר אף קובץ מהגיבוי",
    );
    expect(printed.written.at(-1)).toContain("לא עלה כלום");
  });

  it("says nothing went up when the project fails before the first upload", async () => {
    const { file } = await aBackup();
    const copy = restoredCopy();
    const refusing = {
      ...copy,
      listBuckets: async () => {
        throw new StorageError(401);
      },
    };
    const { code, printed } = await run(
      [file, "--overwrite"],
      [DEV, "", TEMP, TEMP],
      [PASSPHRASE, SECRET],
      { target: refusing as ReturnType<typeof fakeStorage> },
    );
    expect(code).toBe(1);
    expect(printed.written.at(-1)).toBe(
      "Storage לא קיבל את המפתח: הוא לא המפתח הסודי של הפרויקט הזה. לא עלה כלום.",
    );
    expect(printed.text()).not.toContain("אולי עלו");
  });

  it("refuses the publishable key, connecting to nothing", async () => {
    const { file } = await aBackup();
    const { code, clients } = await run(
      [file],
      [DEV, "", TEMP, TEMP],
      [PASSPHRASE, "sb_publishable_abcdefghijkl"],
    );
    expect(code).toBe(2);
    expect(clients).toEqual([]);
  });

  it("stops when files are already there, and overwrites them with --overwrite", async () => {
    const { file } = await aBackup();
    const target = fakeStorage({ avatars: { "u-1/a.jpg": "old" } });
    const first = await run(
      [file],
      [DEV, "", TEMP, TEMP],
      [PASSPHRASE, SECRET],
      {
        target,
      },
    );
    expect(first.code).toBe(2);
    expect(first.printed.text()).toContain("--overwrite");
    expect(target.text("avatars", "u-1/a.jpg")).toBe("old");
    const second = await run(
      [file, "--overwrite"],
      [DEV, "", TEMP, TEMP],
      [PASSPHRASE, SECRET],
      { target },
    );
    expect(second.code).toBe(0);
    expect(target.text("avatars", "u-1/a.jpg")).toBe("avatar");
  });

  it("never runs in CI or GitHub Actions, and needs one file", async () => {
    const { file } = await aBackup();
    const settings: Record<string, string>[] = [
      { CI: "1" },
      { GITHUB_ACTIONS: "true" },
    ];
    for (const env of settings) {
      const { code, printed, secret } = await run([file], [], [], { env });
      expect(code).toBe(2);
      expect(printed.written).toEqual([CI_REFUSAL]);
      expect(secret.asked).toEqual([]);
    }
    for (const args of [
      [],
      [file, file],
      ["--overwrite"],
      [join(tmpdir(), "no-such-backup-file")],
    ]) {
      const { code, secret } = await run(args, [], []);
      expect(code).toBe(2);
      expect(secret.asked).toEqual([]);
    }
  });

  it("ends with 1 when a file didn't go up", async () => {
    const { file } = await aBackup();
    const target = restoredCopy({
      uploadFails: { "avatars/u-1/a.jpg": 400 },
    });
    const { code, printed } = await run(
      [file, "--overwrite"],
      [DEV, "", TEMP, TEMP],
      [PASSPHRASE, SECRET],
      { target },
    );
    expect(code).toBe(1);
    expect(printed.text()).toContain(
      "[x] avatars: 0 קבצים עלו, וקובץ אחד לא עלה",
    );
    expect(printed.text()).not.toContain("u-1");
  });
});

describe("the script", () => {
  it("is plain Node 20: Node's own modules and the backup's, no package, nothing newer", () => {
    const code = readFileSync(
      join(REPO_ROOT, "tooling/restore-files.mjs"),
      "utf8",
    )
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
      .join("\n");
    const imports = [...code.matchAll(/^import\s[^;]*?\sfrom\s+"([^"]+)";/gm)];
    expect(imports.length).toBeGreaterThan(0);
    expect(imports).toHaveLength(code.match(/^import\s/gm)?.length ?? 0);
    for (const [, from] of imports) {
      expect(from).toMatch(/^(node:|\.\/backup-files\.mjs$)/);
    }
    expect(code).not.toMatch(/\brequire\(|\bimport\(/);
    expect(code).not.toContain("@supabase/");
    for (const newer of [
      "import.meta.dirname",
      "import.meta.filename",
      "Promise.withResolvers",
      "Object.groupBy",
      "Map.groupBy",
      "Array.fromAsync",
      "process.getBuiltinModule",
      ".union(",
    ]) {
      expect(code, newer).not.toContain(newer);
    }
  });
});

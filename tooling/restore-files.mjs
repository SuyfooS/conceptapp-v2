// Puts a backup of the files (tooling/backup-files.mjs) into a temporary
// project, for the restore drill in docs/production.md, B8 (closing the
// pilot, PR 20):
//
//   node tooling/restore-files.mjs <backup file>
//   node tooling/restore-files.mjs <backup file> --overwrite
//
// First the file alone: it asks for the passphrase, opens the backup and
// reads it to its end (the passphrase's check, every file against its
// SHA-256 in the manifest, the cipher's tag), and says how many files it
// holds. Only then the project: conceptapp-dev's ref and production's (when
// there is one), so that neither is ever the one written to, then the
// temporary project's ref, typed twice, never the project the backup came
// from, and its secret key, typed with nothing shown. A backup of the local
// stack goes back only to it (`local`, typed twice), and so asks neither
// conceptapp-dev's ref nor production's; `local` is refused for any other
// backup. The project must have the
// app's buckets, and a hosted one must know the backup's files: a project
// restored from the database's backup lists every file's row, so one that
// lists none of them (conceptapp-dev, or any other project typed by
// mistake) is no copy of where the backup came from, whatever ref was typed.
// A file already there stops everything before the first upload unless
// --overwrite is given (the drill needs it, for those rows). Then the backup
// is read a second time and each file uploaded only once its SHA-256 matched
// what the first reading checked. Nothing is written to the disk. It prints
// counts, never a file's name or the key.
//
// Only Orel runs it, on his own computer: it refuses to run where CI or
// GITHUB_ACTIONS is set. Node 20, nothing installed, as tooling/backup-files.mjs.
import { existsSync } from "node:fs";
import { basename } from "node:path";
import {
  askHidden,
  askVisible,
  BackupError,
  BUCKETS,
  Cancelled,
  CI_REFUSAL,
  filesWord,
  keyKind,
  LOCAL_API,
  listObjects,
  NO_TERMINAL,
  NotATerminal,
  OPEN_WORDS,
  openBackup,
  REF,
  runsInCi,
  sizeOf,
  storageClient,
  storageWords,
} from "./backup-files.mjs";

/**
 * @typedef {import("./backup-files.mjs").StorageApi} StorageApi
 * @typedef {import("./backup-files.mjs").Manifest} Manifest
 * @typedef {{ log: (text: string) => void, error: (text: string) => void }} Out
 * @typedef {{ bucket: string, uploaded: number, failed: number }} Sent
 */

/**
 * Why a restore may not write to the project typed: the two typings differ,
 * it isn't a ref, it is conceptapp-dev's, production's or the project the
 * backup came from, or it is the local stack ("local") for a backup of a
 * hosted project: real people's files never go to the computer where
 * sessions and tests run. A backup of the local stack goes back only to it
 * ("hosted" for anything else), which is why it asks for no other ref. Null
 * when it may.
 * @param {string} first
 * @param {string} second
 * @param {{ source: string, dev: string, prod: string }} refused
 * @returns {"twice" | "shape" | "dev" | "prod" | "source" | "local" | "hosted" | null}
 */
export function targetRefusal(first, second, { source, dev, prod }) {
  const typed = first.trim();
  if (typed !== second.trim()) return "twice";
  if (typed === "local") return source === "local" ? null : "local";
  if (source === "local") return "hosted";
  if (!REF.test(typed)) return "shape";
  if (dev !== "" && typed === dev) return "dev";
  if (prod !== "" && typed === prod) return "prod";
  if (source !== "local" && typed === source) return "source";
  return null;
}

/** The address of the project a ref names, or the local stack's. */
export const targetOrigin = (ref) =>
  ref === "local" ? LOCAL_API : `https://${ref}.supabase.co`;

/**
 * The restore itself, once the backup was opened and the project chosen:
 * the app's buckets there, the backup's files known there when `mustKnow`
 * (a hosted project: a copy restored from the database's backup lists their
 * rows), no file already there unless `overwrite`, then the backup read
 * again and each file uploaded once its SHA-256 matched the first reading.
 * `sent` has a count for each of the app's buckets, one the backup has no
 * file in too, so every bucket can be compared with the backup's line for
 * it. A file that fails to upload is counted and the rest go on. `progress`
 * counts the uploads begun, so a failure can say whether any went up.
 * @param {{
 *   client: StorageApi, file: string, passphrase: string,
 *   opened: { manifest: Manifest, digest: string }, overwrite: boolean,
 *   mustKnow?: boolean, progress?: { uploads: number },
 * }} options
 * @returns {Promise<
 *   | { refused: "buckets", bucket: string }
 *   | { refused: "unrelated" }
 *   | { refused: "exists", existing: number }
 *   | { refused: null, sent: Sent[] }
 * >}
 */
export async function restoreInto({
  client,
  file,
  passphrase,
  opened,
  overwrite,
  mustKnow = false,
  progress = { uploads: 0 },
}) {
  const { manifest, digest } = opened;
  const ids = (await client.listBuckets()).map((bucket) => bucket?.id);
  const wanted = BUCKETS.filter((bucket) =>
    manifest.objects.some((item) => item.bucket === bucket),
  );
  const lacking = wanted.find((bucket) => !ids.includes(bucket));
  if (lacking !== undefined) return { refused: "buckets", bucket: lacking };

  let existing = 0;
  for (const bucket of wanted) {
    const there = new Set(
      (await listObjects(client, bucket)).map((listed) => listed.path),
    );
    existing += manifest.objects.filter(
      (item) => item.bucket === bucket && there.has(item.path),
    ).length;
  }
  // Whatever ref was typed for conceptapp-dev, a project that knows none of
  // these files is not the copy the drill made.
  if (mustKnow && manifest.objects.length > 0 && existing === 0) {
    return { refused: "unrelated" };
  }
  if (existing > 0 && !overwrite) return { refused: "exists", existing };

  /** @type {Map<string, Sent>} */
  const sent = new Map(
    BUCKETS.map((bucket) => [bucket, { bucket, uploaded: 0, failed: 0 }]),
  );
  await openBackup(file, passphrase, {
    // The same manifest the first reading checked, or nothing goes.
    onManifest: (_again, again) => {
      if (again !== digest) throw new BackupError("damaged");
    },
    onObject: async (item, bytes) => {
      const count = sent.get(item.bucket);
      if (!count) return;
      progress.uploads += 1;
      try {
        await client.upload(item.bucket, item.path, bytes, {
          contentType: item.contentType,
          cacheControl: item.cacheControl,
          upsert: overwrite,
        });
        count.uploaded += 1;
      } catch {
        count.failed += 1;
      }
    },
  });
  return { refused: null, sent: [...sent.values()] };
}

/** When the backup was made, as Orel reads a date and a time. */
export function madeAt(iso) {
  const date = new Date(iso);
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()} בשעה ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** What the opened backup holds: files, size, buckets and what it lacks. */
export function heldLines(manifest) {
  const bytes = manifest.objects.reduce((sum, item) => sum + item.size, 0);
  const lines = [
    `[v] הגיבוי נפתח ונבדק עד הסוף: ${filesWord(manifest.objects.length)} (${sizeOf(bytes)}), כל אחד לפי ה-SHA-256 שלו. הוא מ-${madeAt(manifest.createdAt)}.`,
  ];
  for (const bucket of BUCKETS) {
    const items = manifest.objects.filter((item) => item.bucket === bucket);
    lines.push(
      `    ${bucket}: ${filesWord(items.length)} (${sizeOf(items.reduce((sum, item) => sum + item.size, 0))})`,
    );
  }
  if (manifest.missing.length > 0) {
    lines.push(
      `[i] ${manifest.missing.length === 1 ? "קובץ אחד לא ירד" : `${manifest.missing.length} קבצים לא ירדו`} בזמן הגיבוי, ולכן ${manifest.missing.length === 1 ? "הוא לא בו" : "הם לא בו"}.`,
    );
  }
  return lines;
}

const USAGE = [
  "כך מריצים, עם הנתיב של קובץ הגיבוי במירכאות:",
  'node tooling/restore-files.mjs "FILE"',
  "ואם הפרויקט כבר מכיר את הקבצים (פרויקט ששוחזר מהגיבוי של המסד):",
  'node tooling/restore-files.mjs "FILE" --overwrite',
].join("\n");

const TARGET_WORDS = {
  twice: "שתי ההקלדות של המזהה לא זהות. לא עלה כלום. מריצים שוב.",
  shape:
    "זה לא מזהה של פרויקט: אותיות באנגלית קטנות ומספרים, כמו בכתובת שלו בלוח. לא עלה כלום.",
  dev: "זה המזהה של conceptapp-dev, ההדגמה. לא משחזרים אליו. לא עלה כלום.",
  prod: "זה המזהה של פרויקט הייצור. הפקודה הזו לא משחזרת אליו. לא עלה כלום.",
  source:
    "זה הפרויקט שהגיבוי ירד ממנו. הפקודה הזו משחזרת רק לפרויקט זמני. לא עלה כלום.",
  local:
    "גיבוי של פרויקט אמיתי לא חוזר לפרויקט המקומי, כי סשנים ובדיקות רצים עליו. לא עלה כלום.",
  hosted:
    "זה גיבוי של הפרויקט המקומי, והוא חוזר רק אליו: מקלידים local. לא עלה כלום.",
};

/** A bucket's line after the uploads, one with no file too. */
function sentLine({ bucket, uploaded, failed }) {
  const up = uploaded === 1 ? "קובץ אחד עלה" : `${filesWord(uploaded)} עלו`;
  if (failed === 0) return `[v] ${bucket}: ${up}`;
  return `[x] ${bucket}: ${up}, ${failed === 1 ? "וקובץ אחד לא עלה" : `ו-${failed} לא עלו`}`;
}

/**
 * The command itself: the exit code it ends with. 0 every file uploaded, 1
 * the backup can't be used or some file didn't go up, 2 refused before the
 * first upload.
 * @param {string[]} args
 * @param {{
 *   env?: Record<string, string | undefined>, out?: Out,
 *   ask?: (question: string) => Promise<string>,
 *   askSecret?: (question: string) => Promise<string>,
 *   fetch?: typeof fetch,
 *   client?: (origin: string, key: string) => StorageApi,
 * }} [deps]
 * @returns {Promise<number>}
 */
export async function main(args, deps = {}) {
  const {
    env = process.env,
    out = console,
    ask = askVisible,
    askSecret = askHidden,
    fetch: fetchImpl = globalThis.fetch,
    client: makeClient = (origin, key) => storageClient(origin, key, fetchImpl),
  } = deps;
  if (runsInCi(env)) {
    out.error(CI_REFUSAL);
    return 2;
  }
  const overwrite = args.includes("--overwrite");
  const rest = args.filter((arg) => arg !== "--overwrite");
  const file = rest[0];
  if (rest.length !== 1 || file === undefined || file.startsWith("-")) {
    out.error(USAGE);
    return 2;
  }
  if (!existsSync(file)) {
    out.error("אין קובץ בנתיב הזה. מעתיקים את הנתיב שהגיבוי כתב בסוף שלו.");
    return 2;
  }
  out.log(
    "שחזור הקבצים לפרויקט זמני: קודם בודקים את קובץ הגיבוי עד הסוף, ורק אחר כך מעלים. מה שמקלידים בסיסמה ובמפתח לא מופיע על המסך.",
  );
  try {
    const passphrase = await askSecret("הסיסמה של הגיבוי: ");
    let opened;
    try {
      opened = await openBackup(file, passphrase);
    } catch (error) {
      if (error instanceof BackupError) {
        out.error(`${OPEN_WORDS[error.kind]} לא עלה כלום.`);
        return 1;
      }
      throw error;
    }
    for (const line of heldLines(opened.manifest)) out.log(line);

    // A backup of the local stack goes back only to it (targetRefusal), so
    // neither conceptapp-dev's ref nor production's is asked for it.
    let dev = "";
    let prod = "";
    if (opened.manifest.source === "local") {
      out.log(
        "[i] זה גיבוי של הפרויקט המקומי, והוא חוזר רק אליו: בשאלה על הפרויקט הזמני מקלידים local.",
      );
    } else {
      dev = (
        await ask(
          "המזהה של conceptapp-dev, שמופיע בכתובת שלו בלוח (כדי לא לשחזר אליו): ",
        )
      ).trim();
      if (!REF.test(dev)) {
        out.error(TARGET_WORDS.shape);
        return 2;
      }
      prod = (
        await ask(
          "המזהה של conceptapp-prod, אם כבר יש פרויקט כזה (אם אין: Enter): ",
        )
      ).trim();
      if (prod !== "" && !REF.test(prod)) {
        out.error(TARGET_WORDS.shape);
        return 2;
      }
    }
    const first = await ask(
      "המזהה של הפרויקט הזמני, שאליו משחזרים (מהכתובת שלו בלוח): ",
    );
    const second = await ask("שוב, המזהה של הפרויקט הזמני: ");
    const refusal = targetRefusal(first, second, {
      source: opened.manifest.source,
      dev,
      prod,
    });
    if (refusal !== null) {
      out.error(TARGET_WORDS[refusal]);
      return 2;
    }
    const key = await askSecret(
      "המפתח הסודי של הפרויקט הזמני (Project Settings, ואז API Keys, בפרויקט הזמני): ",
    );
    const kind = keyKind(key);
    if (kind !== "secret") {
      out.error(
        kind === "publishable"
          ? "זה המפתח הציבורי. צריך את המפתח הסודי של הפרויקט הזמני. לא עלה כלום."
          : "זה לא נראה כמו מפתח של Supabase. צריך את המפתח הסודי, שמתחיל ב-sb_secret_. לא עלה כלום.",
      );
      return 2;
    }
    const target = first.trim();
    const progress = { uploads: 0 };
    let result;
    try {
      result = await restoreInto({
        client: makeClient(targetOrigin(target), key.trim()),
        file,
        passphrase,
        opened,
        overwrite,
        mustKnow: target !== "local",
        progress,
      });
    } catch (error) {
      if (error instanceof BackupError) {
        out.error(
          `${OPEN_WORDS[error.kind]} הקריאה השנייה של הגיבוי נעצרה, ואחריה לא עלה עוד קובץ.`,
        );
        return 1;
      }
      // Before the first upload (the buckets, the listing), nothing went up.
      out.error(
        progress.uploads > 0
          ? `${storageWords(error)} אולי עלו חלק מהקבצים. מריצים שוב עם --overwrite.`
          : `${storageWords(error)} לא עלה כלום.`,
      );
      return 1;
    }
    if (result.refused === "buckets") {
      out.error(
        `בפרויקט אין bucket בשם ${result.bucket}: המסד שלו לא של האפליקציה, או שעוד לא שוחזר. לא עלה כלום.`,
      );
      return 2;
    }
    if (result.refused === "unrelated") {
      out.error(
        "הפרויקט הזה לא מכיר אף קובץ מהגיבוי. פרויקט זמני ששוחזר מהגיבוי של המסד (ב8, צעד 4) מכיר אותם, ולכן זה לא הוא. לא עלה כלום. בודקים את המזהה של הפרויקט הזמני, ואם הוא נכון, שואלים בסשן.",
      );
      return 2;
    }
    if (result.refused === "exists") {
      out.error(
        `בפרויקט כבר יש ${filesWord(result.existing)} מהגיבוי, ולכן לא עלה כלום. בפרויקט זמני ששוחזר מהגיבוי של המסד זה צפוי: מריצים שוב עם --overwrite בסוף השורה.`,
      );
      return 2;
    }
    for (const count of result.sent) out.log(sentLine(count));
    const failed = result.sent.reduce((sum, count) => sum + count.failed, 0);
    if (failed > 0) {
      out.error(
        `[x] ${failed === 1 ? "קובץ אחד לא עלה" : `${failed} קבצים לא עלו`}. מריצים שוב עם --overwrite, ואם זה חוזר, שואלים בסשן.`,
      );
      return 1;
    }
    out.log("הכול עלה, כל קובץ אחרי שה-SHA-256 שלו נבדק.");
    return 0;
  } catch (error) {
    if (error instanceof NotATerminal) {
      out.error(NO_TERMINAL);
      return 2;
    }
    if (error instanceof Cancelled) {
      out.error("הופסק.");
      return 1;
    }
    out.error(
      "השחזור נעצר לפני שהסתיים. מריצים שוב, ואם זה חוזר, שואלים בסשן.",
    );
    return 1;
  }
}

if (basename(process.argv[1] ?? "") === "restore-files.mjs") {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      console.error(
        "השחזור נעצר לפני שהסתיים. מריצים שוב, ואם זה חוזר, שואלים בסשן.",
      );
      process.exitCode = 1;
    },
  );
}

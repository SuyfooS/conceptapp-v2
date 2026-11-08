import type { SentenceProblem } from "@domain/wording";

export type WordingProblem = SentenceProblem | "syntax" | "failed" | "noAccess";

/**
 * A sentence saved, or cleared with null so the template's or the app's shows
 * again. `sentence` is the business's own sentence now, tidied, and null when
 * what was saved is just what it showed without one. `previous` is what it
 * replaced, which an undo writes back.
 */
export type WordingSaveResult =
  | { ok: true; sentence: string | null; previous: string | null }
  | { ok: false; problem: WordingProblem };

export type SaveWording = (
  key: string,
  sentence: string | null,
) => Promise<WordingSaveResult>;

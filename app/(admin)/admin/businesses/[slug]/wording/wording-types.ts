import type { SentenceProblem } from "@domain/wording";

export type WordingProblem = SentenceProblem | "syntax" | "failed" | "noAccess";

/**
 * A sentence saved, or cleared with null so the template's or the app's shows
 * again. `previous` is what it replaced, which an undo writes back.
 */
export type WordingSaveResult =
  | { ok: true; previous: string | null }
  | { ok: false; problem: WordingProblem };

export type SaveWording = (
  key: string,
  sentence: string | null,
) => Promise<WordingSaveResult>;

import type { CSSProperties } from "react";

/**
 * A short line whose words come into focus one after another when the page
 * loads, so the last word lands last. Whole words only, which keeps Hebrew
 * intact. The text stays ordinary text for search and screen readers.
 */
export function FocusText({ text }: { text: string }) {
  return text.split(" ").map((word, i) => (
    // The words of one line never change order, and may repeat.
    <span key={`${word}-${i.toString()}`}>
      {i > 0 ? " " : null}
      <span
        className="focus-in inline-block"
        style={{ "--i": i } as CSSProperties}
      >
        {word}
      </span>
    </span>
  ));
}

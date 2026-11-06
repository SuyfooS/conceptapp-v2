import type { CSSProperties } from "react";

/**
 * Words that replace one another as the page scrolls, coming to rest on the
 * last. It only moves when the visitor scrolls. Without scroll timelines, or
 * under reduced motion, the last word is all there is. Decoration: give screen
 * readers the whole sentence next to it.
 */
export function WordCycle({ words }: { words: string[] }) {
  const last = words.length - 1;
  return (
    <span aria-hidden="true" className="inline-grid">
      {words.map((word, i) => (
        <span
          key={word}
          className={`col-start-1 row-start-1 ${i === last ? "word-arrive" : "word-pass"}`}
          style={{ "--i": i } as CSSProperties}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

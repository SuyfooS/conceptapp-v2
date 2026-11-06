/** Up to two initials: the first letter of the first two words. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("");
}

/** The name someone is called by: the first word of their full name. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * Names short enough for a card: first names, unless two on the list share
 * one, when those two keep their full names.
 */
export function shortNames(names: readonly string[]): string[] {
  const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;
  const firsts = names.map(firstOf);
  return names.map((name, i) =>
    firsts.filter((first) => first === firsts[i]).length > 1
      ? name
      : firstOf(name),
  );
}

/** A stable hue (0 to 359) for a person, so their avatar keeps its colour. */
export function avatarHue(name: string): number {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  }
  return hash;
}

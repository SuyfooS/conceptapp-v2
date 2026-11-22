"use client";

import type { FileFilter as FileChoice, FileTag } from "@domain/file-holders";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { Segmented } from "@ui/segmented";
import { createContext, type ReactNode, use, useState } from "react";

/*
 * The team's filter of the hiring files (profile H6b-2): everyone, the
 * files missing details, or an open 101, the same choice over the phone's
 * and the tablet's lists and the desktop's table. Each row says which it
 * shows under (`fileFilterTags`, from what the viewer sees, worked out on
 * the server); invites, owners and the accountant have no file, so they
 * show under "כולם" alone. The choice isn't kept: a reload shows everyone.
 */

type Filtering = {
  choice: FileChoice;
  choose: (choice: FileChoice) => void;
  /** How many rows show under each choice. */
  counts: Record<FileTag, number>;
};

const FilterContext = createContext<Filtering | null>(null);

/** The choice, over what it filters. */
export function FileFilter({
  counts,
  children,
}: {
  counts: Record<FileTag, number>;
  children: ReactNode;
}) {
  const [choice, choose] = useState<FileChoice>("all");
  return (
    <FilterContext value={{ choice, choose, counts }}>{children}</FilterContext>
  );
}

/**
 * "כולם · חסרים פרטים · 101 פתוח" (the last only while the business takes
 * the 101 in the app): no counts on the choices, so it fits a phone; each
 * row already says what is missing.
 */
export function FileFilterChoice({
  label,
  options,
}: {
  label: string;
  options: { value: FileChoice; label: string }[];
}) {
  const filtering = use(FilterContext);
  if (!filtering) return null;
  return (
    <Segmented
      label={label}
      options={options}
      value={filtering.choice}
      onChange={filtering.choose}
      className="w-full md:w-auto md:self-start"
    />
  );
}

/** A row, while the choice shows it: under "כולם" always, else by its tags. */
export function FileShown({
  tags,
  children,
}: {
  tags: readonly FileTag[];
  children: ReactNode;
}) {
  const filtering = use(FilterContext);
  const choice = filtering?.choice ?? "all";
  return choice === "all" || tags.includes(choice) ? children : null;
}

/**
 * The lists and the table, or, when the choice shows nobody, what that
 * means ("לאף אחד לא חסרים פרטים לשכר.") and the way back to everyone.
 */
export function FileFiltered({
  empty,
  showAll,
  children,
}: {
  empty: Record<FileTag, string>;
  showAll: string;
  children: ReactNode;
}) {
  const filtering = use(FilterContext);
  if (
    !filtering ||
    filtering.choice === "all" ||
    filtering.counts[filtering.choice] > 0
  ) {
    return children;
  }
  return (
    <Card padding="lg" className="flex flex-col gap-3 md:max-w-2xl">
      <CardText>{empty[filtering.choice]}</CardText>
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => filtering.choose("all")}
      >
        {showAll}
      </Button>
    </Card>
  );
}

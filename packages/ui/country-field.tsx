"use client";

import { type Country, ISO_COUNTRIES } from "@domain/identity-documents";
import { type ReactNode, useMemo, useState } from "react";
import { SearchField } from "./search-field";

/** Matches shown at once, as the town's. */
const SHOWN = 8;

/** Lower case, no marks, nothing between words: how names are compared. */
const loose = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s'".()-]+/g, "");

/**
 * The country that issued a document (the hiring file, H5a): ISO 3166's,
 * named in the screen's language by the browser (`Intl.DisplayNames`), so the
 * messages hold none. Found by the start of its name or of a word in it, or
 * by its two letters.
 */
export function CountryField({
  label,
  locale,
  value,
  onChange,
  emptyText,
  placeholder,
  hint,
  error,
}: {
  label: string;
  locale: "he" | "en";
  value: Country | null;
  onChange: (country: Country | null) => void;
  emptyText: string;
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const names = useMemo(() => {
    const display = new Intl.DisplayNames([locale], { type: "region" });
    return ISO_COUNTRIES.map((code) => {
      const name = display.of(code) ?? code;
      return {
        code,
        name,
        whole: loose(name),
        words: name.split(/[\s-]+/).map(loose),
      };
    });
  }, [locale]);

  const typed = loose(query);
  const found =
    typed === ""
      ? []
      : names
          .flatMap((country) => {
            const rank = country.whole.startsWith(typed)
              ? 0
              : country.words.some((word) => word.startsWith(typed))
                ? 1
                : country.code.toLowerCase() === typed
                  ? 2
                  : null;
            return rank === null ? [] : [{ country, rank }];
          })
          .sort(
            (a, b) =>
              a.rank - b.rank ||
              a.country.name.localeCompare(b.country.name, locale),
          )
          .slice(0, SHOWN)
          .map(({ country }) => country);

  const picked = value
    ? (names.find((country) => country.code === value) ?? null)
    : null;
  return (
    <SearchField
      label={label}
      query={query}
      onQuery={setQuery}
      options={found.map((country) => ({
        key: country.code,
        label: country.name,
      }))}
      emptyText={emptyText}
      picked={picked ? { key: picked.code, label: picked.name } : null}
      onPick={(key) =>
        onChange(ISO_COUNTRIES.find((code) => code === key) ?? null)
      }
      placeholder={placeholder}
      hint={hint}
      error={error}
    />
  );
}

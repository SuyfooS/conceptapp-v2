"use client";

import type { City } from "@domain/cities";
import { type ReactNode, useState } from "react";
import { SearchField } from "./search-field";

type Cities = typeof import("@domain/cities");

/** Its name in the screen's language: the English one, or the Hebrew where there is none. */
const nameOf = (city: City, locale: "he" | "en") =>
  locale === "en" && city.en !== "" ? city.en : city.he;

/**
 * The town of an address (the hiring file, H5a): one of Israel's 1,300 or so
 * settlements, found by typing in either language and spelled either way
 * (@domain/cities). The list loads the first time the field takes the
 * focus, so it isn't in every page's bundle; a town already chosen shows
 * from `value` without it.
 */
export function CityField({
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
  value: City | null;
  onChange: (city: City | null) => void;
  emptyText: string;
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  const [cities, setCities] = useState<Cities | null>(null);
  const [query, setQuery] = useState("");

  function load() {
    if (cities) return;
    import("@domain/cities").then(setCities, () => {});
  }

  const found = cities && query.trim() ? cities.searchCities(query) : [];
  return (
    <SearchField
      label={label}
      query={query}
      onQuery={(text) => {
        load();
        setQuery(text);
      }}
      // Until the list is here, nothing is said to meet nothing.
      options={found.map((city) => ({
        key: String(city.code),
        label: nameOf(city, locale),
      }))}
      emptyText={cities ? emptyText : ""}
      picked={
        value ? { key: String(value.code), label: nameOf(value, locale) } : null
      }
      onPick={(key) =>
        onChange(
          key === null
            ? null
            : (found.find((city) => String(city.code) === key) ?? null),
        )
      }
      onFocus={load}
      placeholder={placeholder}
      hint={hint}
      error={error}
    />
  );
}

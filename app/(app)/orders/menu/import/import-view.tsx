"use client";

import {
  againstMenu,
  type ImportWords,
  importRows,
  type MenuRow,
  parseMenu,
  reverseLine,
} from "@domain/menu-import";
import type { Menu } from "@domain/order-taking";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceMenu, choiceShown } from "@ui/choice-menu";
import { cn } from "@ui/cn";
import { FloatingAction, floatingButtonClass } from "@ui/floating-action";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { TextArea } from "@ui/text-field";
import { ArrowLeftRight, Check, FileInput, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { FailureLine, ltr, useShekels } from "../menu-parts";
import type {
  ImportMenu,
  MenuActionFailure,
  MenuDepartment,
} from "../menu-types";

/** Each line a PDF turned around turned back, the rest as pasted. */
function unreversed(paste: string, rows: readonly MenuRow[]): string {
  const lines = paste.split(/\r?\n/);
  for (const row of rows) {
    if (!row.ok && row.problem === "reversed") {
      lines[row.line - 1] = reverseLine(row.text);
    }
  }
  return lines.join("\n");
}

/**
 * Copying in the menu that exists (waiter mode P2, the design's §5.2): pasted
 * from the website, a PDF, WhatsApp or the till's export. The preview numbers
 * every line and says what it became or what is wrong with it, read by
 * @domain/menu-import and checked against the menu already there
 * (`againstMenu`): a category the menu has takes the items and keeps its
 * department, an item it has already is left out, and each new category
 * picks the department that prepares it. Nothing is added while a line has a
 * problem, so no line goes quietly; then everything goes in at once
 * (`public.import_menu`). Phone: the paste, then the preview. Tablet and
 * computer: side by side. The same screen for the team in the console.
 */
export function MenuImportView({
  existing,
  departments,
  importMenu,
  paths,
  eyebrow,
  initialPaste = "",
}: {
  /** The menu already there. */
  existing: Pick<Menu, "categories" | "items">;
  /** The business's departments, removed ones too, for their names. */
  departments: MenuDepartment[];
  importMenu: ImportMenu;
  paths: {
    back: { href: string; label: string };
    /** Where the done card leads. */
    done: { href: string; label: string };
    /** Where departments are made, for a business with none; null when not the person's. */
    departments: string | null;
  };
  eyebrow?: string;
  /** What the field starts with: the twin's café. */
  initialPaste?: string;
}) {
  const t = useTranslations("app.orders.import");
  const tn = useTranslations("modules.order_taking");
  const tm = useTranslations("app.orders.menu");
  const shekels = useShekels();
  const heading = useRef<HTMLHeadingElement>(null);
  const [paste, setPaste] = useState(initialPaste);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{
    items: number;
    categories: number;
  } | null>(null);
  const [failure, setFailure] = useState<MenuActionFailure | null>(null);
  const [importing, setImporting] = useState(false);

  const words: ImportWords = {
    size: tn("importWords.size"),
    regular: tn("importWords.regular"),
    large: tn("importWords.large"),
    extras: tn("importWords.extras"),
    general: tn("importWords.general"),
  };
  const parsed = parseMenu(paste, words);
  const check = againstMenu(parsed, existing);
  const live = departments.filter((d) => d.live);
  const options = live.map((d) => ({ key: d.id, label: d.name }));
  const nameOf = (id: string) =>
    live.find((d) => d.id === id)?.name ?? tm("noRoute");
  const key = (name: string) => name.toLowerCase();
  const departmentOf = (name: string) => {
    const picked = chosen[key(name)];
    return picked && live.some((d) => d.id === picked)
      ? picked
      : (live[0]?.id ?? "");
  };
  const byName = new Map(check.categories.map((c) => [key(c.name), c]));
  const problems = parsed.rows.filter((row) => !row.ok).length;
  const tooMany = check.tooMany || parsed.error === "tooMany";
  const noDepartments = live.length === 0 && check.newCategories > 0;
  const ready =
    problems === 0 && !tooMany && !noDepartments && check.newItems > 0;

  async function importNow() {
    setImporting(true);
    const rows = importRows(
      check.categories,
      check.categories.map(
        (c) => c.existing?.department ?? departmentOf(c.name),
      ),
    );
    let result: Awaited<ReturnType<ImportMenu>>;
    try {
      result = await importMenu(rows);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    setImporting(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setFailure(null);
    setDone(result.value);
    heading.current?.focus({ preventScroll: true });
  }

  const outcome = (row: MenuRow) => {
    if (!row.ok) return t(`problem.${row.problem}`);
    if (check.known.has(row.line)) return t("line.known");
    const { became } = row;
    switch (became.kind) {
      case "header":
        return t("line.header");
      case "category": {
        const category = byName.get(key(became.name));
        return category?.existing
          ? t("line.categoryKnown", {
              department: nameOf(category.existing.department),
            })
          : t("line.category");
      }
      case "sizes":
        return t.rich("line.sizes", {
          regular: shekels(became.priceAgorot),
          large: shekels(became.largeAgorot),
          ltr,
        });
      case "extra":
        return t.rich("line.extra", {
          price: shekels(became.priceAgorot),
          ltr,
        });
      default:
        return t.rich("line.item", { price: shekels(became.priceAgorot), ltr });
    }
  };

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={paths.back}
        eyebrow={eyebrow ?? tn("name")}
        title={t("title")}
        headingRef={heading}
        subtitle={t("subtitle")}
      />
      <FailureLine failure={failure} />
      {done !== null ? (
        <Card
          tone="accent"
          padding="lg"
          className="flex flex-col gap-3 md:max-w-2xl"
        >
          <p role="status" className="flex items-center gap-2 font-semibold">
            <Check aria-hidden="true" className="size-5 shrink-0 text-accent" />
            {t("done", { items: done.items, categories: done.categories })}
          </p>
          <Button asChild variant="secondary" className="self-start">
            <Link href={paths.done.href}>{paths.done.label}</Link>
          </Button>
        </Card>
      ) : null}
      {existing.items.length > 0 ? (
        <p className="text-ink-2 md:max-w-2xl">
          {t("existing", {
            items: existing.items.length,
            categories: existing.categories.length,
          })}
        </p>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8">
        <TextArea
          label={t("paste")}
          hint={t("hint")}
          rows={14}
          dir="auto"
          value={paste}
          onChange={(event) => {
            setPaste(event.target.value);
            setDone(null);
            setFailure(null);
          }}
        />
        <PageSection title={t("preview")}>
          {parsed.rows.length === 0 ? (
            <p className="rounded-card bg-surface px-4 py-3.5 text-ink-2 shadow-card">
              {t("previewEmpty")}
            </p>
          ) : (
            <>
              <p className="-mt-1 px-1 text-ink-2">
                {t("counts", {
                  items: check.newItems,
                  categories: check.categories.length,
                  problems,
                })}
              </p>
              {parsed.reversed ? (
                <Button
                  variant="secondary"
                  className="self-start"
                  onClick={() => setPaste(unreversed(paste, parsed.rows))}
                >
                  <ArrowLeftRight aria-hidden="true" />
                  {t("unreverse")}
                </Button>
              ) : null}
              <ol className="overflow-hidden rounded-card bg-surface shadow-card">
                {parsed.rows.map((row) => {
                  const category =
                    row.ok && row.became.kind === "category"
                      ? byName.get(key(row.became.name))
                      : undefined;
                  const picks = category && category.existing === null;
                  const known = row.ok && check.known.has(row.line);
                  return (
                    <li
                      key={row.line}
                      className="relative flex flex-wrap items-start gap-3 px-4 py-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
                    >
                      <span
                        dir="ltr"
                        className="grid min-w-8 shrink-0 place-items-center rounded-full bg-surface-2 px-1.5 py-0.5 font-semibold text-ink-2 text-sm tabular-nums"
                      >
                        {row.line}
                      </span>
                      <span className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                        <span
                          className={cn(
                            "break-words font-medium",
                            row.ok &&
                              row.became.kind === "category" &&
                              "font-bold",
                            known && "text-ink-2",
                          )}
                        >
                          {row.text}
                        </span>
                        <span
                          className={cn(
                            "flex items-start gap-1.5 text-sm",
                            !row.ok
                              ? "font-semibold text-danger"
                              : !known && row.became.kind === "sizes"
                                ? "font-medium text-warning"
                                : "text-ink-2",
                          )}
                        >
                          {!row.ok ? (
                            <TriangleAlert
                              aria-hidden="true"
                              className="mt-0.5 size-4 shrink-0"
                            />
                          ) : null}
                          <span>{outcome(row)}</span>
                        </span>
                      </span>
                      {picks && category && live.length > 0 ? (
                        <ChoiceMenu
                          label={`${t("department", { category: category.name })}: ${
                            choiceShown(options, departmentOf(category.name)) ??
                            ""
                          }`}
                          value={departmentOf(category.name)}
                          options={options}
                          onChange={(id) =>
                            setChosen((now) => ({
                              ...now,
                              [key(category.name)]: id,
                            }))
                          }
                          className="shrink-0 text-ink"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {problems > 0 ? (
                <p role="status" className="px-1 font-medium">
                  {t("blocked", { count: problems })}
                </p>
              ) : tooMany ? (
                <p role="status" className="px-1 font-medium">
                  {t("tooMany")}
                </p>
              ) : noDepartments ? (
                <div className="flex flex-col gap-2 px-1">
                  <p role="status" className="font-medium">
                    {t("noDepartments")}
                  </p>
                  {paths.departments ? (
                    <Button asChild variant="secondary" className="self-start">
                      <Link href={paths.departments}>{t("toDepartments")}</Link>
                    </Button>
                  ) : null}
                </div>
              ) : check.newItems === 0 && done === null ? (
                <p role="status" className="px-1 text-ink-2">
                  {t("nothingNew")}
                </p>
              ) : null}
            </>
          )}
          {ready && done === null ? (
            <FloatingAction>
              <Button
                size="lg"
                loading={importing}
                className={cn("w-full", floatingButtonClass, "md:shadow-none")}
                onClick={() => void importNow()}
              >
                <FileInput aria-hidden="true" />
                {t("action", { count: check.newItems })}
              </Button>
            </FloatingAction>
          ) : null}
        </PageSection>
      </div>
    </PageBody>
  );
}

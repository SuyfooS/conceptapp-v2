"use client";

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
import { useRef, useState } from "react";
import { importMenu } from "../../../changes";
import { demoPastedMenu, orderDemoDepartments } from "../../../data";
import { useOrderDemo } from "../../../demo-store";
import type { DepartmentKey } from "../../../model";
import { ltr, type OrderT, paths, useOrderWords } from "../../../parts";
import {
  importCount,
  imported,
  type PastedLine,
  readPaste,
  unreversed,
} from "../../../paste";

/**
 * Pasting the menu that exists (§5.2): from a website, a PDF, a WhatsApp
 * message or the register's export. The preview numbers every line and
 * says what it became or what is wrong with it; each new category picks
 * its department, the first by default; a line a PDF turned around is
 * turned back with one press; and "יבוא" adds everything at once. Phone:
 * the paste, then the preview. Tablet and desktop: side by side.
 */
export function ImportScreen() {
  const { t } = useOrderWords();
  const { update } = useOrderDemo();
  const heading = useRef<HTMLHeadingElement>(null);
  const [paste, setPaste] = useState(demoPastedMenu);
  const [departments, setDepartments] = useState<Record<string, DepartmentKey>>(
    {},
  );
  const [done, setDone] = useState<number | null>(null);
  const lines = readPaste(paste);
  const count = importCount(lines);
  const problems = lines.filter((line) => line.kind === "problem").length;
  const reversed = lines.some((line) => line.problem === "reversed");
  const departmentOf = (category: string) =>
    departments[category] ?? orderDemoDepartments[0]?.key ?? "kitchen";

  function importNow() {
    update((d) => importMenu(d, imported(lines, departmentOf)));
    setDone(count);
    heading.current?.focus({ preventScroll: true });
  }

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.menu, label: t("nav.menu") }}
        eyebrow={t("mode")}
        title={t("import.title")}
        headingRef={heading}
        subtitle={t("import.subtitle")}
      />
      {done !== null ? (
        <Card
          tone="accent"
          padding="lg"
          className="flex flex-col gap-3 md:max-w-2xl"
        >
          <p role="status" className="flex items-center gap-2 font-semibold">
            <Check aria-hidden="true" className="size-5 text-accent" />
            {t("import.done", { count: done })}
          </p>
          <Button asChild variant="secondary" className="self-start">
            <Link href={paths.menu}>{t("import.toMenu")}</Link>
          </Button>
        </Card>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8">
        <div className="flex flex-col gap-3">
          <TextArea
            label={t("import.paste")}
            hint={t("import.hint")}
            rows={14}
            value={paste}
            onChange={(event) => {
              setPaste(event.target.value);
              setDone(null);
            }}
          />
        </div>
        <PageSection title={t("import.preview")}>
          <p className="-mt-1 px-1 text-ink-2">
            {t("import.counts", {
              items: count,
              categories: lines.filter((l) => l.kind === "category").length,
              problems,
            })}
          </p>
          {reversed ? (
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => setPaste(unreversed(paste))}
            >
              <ArrowLeftRight aria-hidden="true" />
              {t("import.unreverse")}
            </Button>
          ) : null}
          <ol className="overflow-hidden rounded-card bg-surface shadow-card">
            {lines.map((line) => (
              <PreviewLine
                key={line.n}
                t={t}
                line={line}
                department={
                  line.kind === "category" ? departmentOf(line.name) : null
                }
                onDepartment={(key) =>
                  setDepartments((now) => ({ ...now, [line.name]: key }))
                }
              />
            ))}
          </ol>
          {done === null && count > 0 ? (
            <FloatingAction>
              <Button
                size="lg"
                className={cn("w-full", floatingButtonClass, "md:shadow-none")}
                onClick={importNow}
              >
                <FileInput aria-hidden="true" />
                {t("import.action", { count })}
              </Button>
            </FloatingAction>
          ) : null}
        </PageSection>
      </div>
    </PageBody>
  );
}

function PreviewLine({
  t,
  line,
  department,
  onDepartment,
}: {
  t: OrderT;
  line: PastedLine;
  department: DepartmentKey | null;
  onDepartment: (key: DepartmentKey) => void;
}) {
  const { shekels } = useOrderWords();
  const options = orderDemoDepartments.map((d) => ({
    key: d.key,
    label: d.name,
  }));
  const result =
    line.kind === "category"
      ? t("import.line.category")
      : line.kind === "extra"
        ? t.rich("import.line.extra", {
            price: shekels(line.price ?? 0),
            ltr,
          })
        : line.kind === "item" && line.large !== null
          ? t.rich("import.line.sizes", {
              regular: shekels(line.price ?? 0),
              large: shekels(line.large),
              ltr,
            })
          : line.kind === "item"
            ? t.rich("import.line.item", {
                price: shekels(line.price ?? 0),
                ltr,
              })
            : t(`import.problem.${line.problem ?? "unclear"}`);
  return (
    <li className="relative flex items-start gap-3 px-4 py-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']">
      <span
        dir="ltr"
        className="grid min-w-8 shrink-0 place-items-center rounded-full bg-surface-2 px-1.5 py-0.5 font-semibold text-ink-2 text-sm tabular-nums"
      >
        {line.n}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "break-words font-medium",
            line.kind === "category" && "font-bold",
          )}
        >
          {line.text}
        </span>
        <span
          className={cn(
            "flex items-start gap-1.5 text-sm",
            line.kind === "problem"
              ? "font-semibold text-danger"
              : line.large !== null
                ? "font-medium text-warning"
                : "text-ink-2",
          )}
        >
          {line.kind === "problem" ? (
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
          ) : null}
          <span>{result}</span>
        </span>
      </span>
      {department ? (
        <ChoiceMenu
          label={`${t("import.department", { category: line.name })}: ${choiceShown(options, department) ?? ""}`}
          value={department}
          options={options}
          onChange={(key) => onDepartment(key as DepartmentKey)}
          className="shrink-0 text-ink"
        />
      ) : null}
    </li>
  );
}

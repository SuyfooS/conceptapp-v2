"use client";

import { templatesByDepartment } from "@domain/lists";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { StatusToast } from "@ui/status-toast";
import { ChevronDown, ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { UndoRow } from "../../manage/undo-row";
import type {
  ListActionResult,
  ListFailure,
  RestoreTemplate,
  TemplatePaths,
  TemplateRow,
  TemplatesScreenData,
} from "../list-types";
import { useTimeWords } from "./schedule-words";

const th = "px-4 py-3 text-start font-medium text-ink-2 text-sm";
const td = "border-line border-t px-4 py-3 align-middle";

/**
 * The business's templates: what can be sent, and the way into each one's
 * editor. Grouped by the department each goes to, then the rest; an order
 * between departments says so, and so does when each goes by itself (its
 * first time, and a badge for a time that points at something gone). Phone:
 * one group under the other. Tablet: the groups in two columns. Desktop: one
 * table, with when each goes and who asks for each order.
 * Removed ones wait folded at the end, each with its way back, and the one
 * just removed in its editor has its undo on top. Used on /lists/templates
 * and by the team in the console.
 */
export function TemplatesView({
  data,
  restore,
  paths,
}: {
  data: TemplatesScreenData;
  restore: RestoreTemplate;
  paths: TemplatePaths;
}) {
  const t = useTranslations("app.lists.templates");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [back, setBack] = useState<{ name: string; stamp: number } | null>(
    null,
  );
  const [undone, setUndone] = useState<string | null>(null);
  const [failure, setFailure] = useState<ListFailure | null>(null);

  const groups = templatesByDepartment(data.templates, data.departments);
  const editorOf = (id: string) => `${paths.list}/${id}`;
  const { when } = useTimeWords(
    Object.entries(data.shiftNames).map(([key, name]) => ({ key, name })),
  );

  const recipientWords = (row: TemplateRow): string => {
    const recipient = row.recipient;
    switch (recipient?.kind) {
      case "department": {
        const name = data.departmentNames[recipient.department];
        return name ? t("to.department", { name }) : t("to.aDepartment");
      }
      case "shift": {
        const name = data.shiftNames[recipient.shift];
        return name ? t("to.shift", { name }) : t("to.aShift");
      }
      case "role":
        return t("to.role", { role: recipient.role });
      default:
        return t("to.none");
    }
  };
  const fromWords = (row: TemplateRow) =>
    row.fromDepartment
      ? t("from", {
          name: data.departmentNames[row.fromDepartment] ?? t("aDepartment"),
        })
      : null;
  /** When it goes by itself: its first time and how many more, or paused. */
  const timesWords = (row: TemplateRow): ReactNode =>
    row.times.first ? (
      <>
        {when(row.times.first)}
        {row.times.count > 1
          ? ` ${t("moreTimes", { count: row.times.count - 1 })}`
          : null}
      </>
    ) : row.times.count > 0 ? (
      t("timesPaused", { count: row.times.count })
    ) : null;
  const goneBadge = (row: TemplateRow) =>
    row.times.gone > 0 ? (
      <Badge tone="warning">{t("timesGone", { count: row.times.gone })}</Badge>
    ) : null;
  const subtitleOf = (row: TemplateRow): ReactNode => {
    const times = timesWords(row);
    const from = fromWords(row);
    return (
      <>
        {t("items", { count: row.items })}
        {times ? <> · {times}</> : null}
        {` · ${recipientWords(row)}`}
        {from ? ` · ${from}` : null}
      </>
    );
  };
  const groupTitle = (department: string | null) =>
    department === null
      ? groups.length === 1
        ? t("all")
        : t("others")
      : (data.departmentNames[department] ?? t("aDepartment"));

  function bringBack(row: TemplateRow, fromUndo: boolean) {
    setRestoring(row.id);
    setFailure(null);
    start(async () => {
      let result: ListActionResult;
      try {
        result = await restore(row.id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      setRestoring(null);
      if (!result.ok) {
        setFailure(result.failure);
        return;
      }
      setBack({ name: row.name, stamp: Date.now() });
      if (fromUndo) {
        setUndone(row.id);
        router.replace(paths.list);
      }
    });
  }

  const create = data.readOnly ? null : (
    <Button asChild size="lg">
      <Link href={`${paths.list}/new`}>
        <Plus aria-hidden="true" />
        {t("create")}
      </Link>
    </Button>
  );

  const rowsOf = (rows: readonly TemplateRow[]) => (
    <ListGroup>
      {rows.map((row) => (
        <ListRow
          key={row.id}
          href={editorOf(row.id)}
          title={row.name}
          subtitle={subtitleOf(row)}
          trailing={
            row.fromDepartment || row.times.gone > 0 ? (
              <span className="flex flex-col items-end gap-1">
                {row.fromDepartment ? (
                  <Badge tone="neutral">{t("order")}</Badge>
                ) : null}
                {goneBadge(row)}
              </span>
            ) : undefined
          }
        />
      ))}
    </ListGroup>
  );

  const just =
    data.justRemoved && data.justRemoved.id !== undone
      ? data.justRemoved
      : null;

  return (
    <PageBody className={pageGlowClass}>
      <StatusToast
        message={back ? t("restored", { name: back.name }) : null}
        stamp={back ? String(back.stamp) : undefined}
      />
      <PageHeader
        back={paths.back}
        title={t("title")}
        subtitle={data.readOnly ? t("viewOnly") : t("subtitle")}
        actions={create}
      />

      {just ? (
        <UndoRow
          message={t("removed", { name: just.name })}
          onUndo={() => bringBack(just, true)}
          pending={pending && restoring === just.id}
        />
      ) : null}
      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t(`failed.${failure}`)}
        </p>
      ) : null}

      {data.templates.length === 0 ? (
        <EmptyState
          headingLevel="h2"
          icon={<ClipboardList />}
          title={data.readOnly ? t("emptyViewOnly.title") : t("empty.title")}
          body={data.readOnly ? t("emptyViewOnly.body") : t("empty.body")}
          className="md:py-12"
        />
      ) : (
        <>
          {/* Phone and tablet: by department, in two columns on a tablet. */}
          <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8 xl:hidden">
            {groups.map((group) => (
              <PageSection
                key={group.department ?? "rest"}
                title={groupTitle(group.department)}
              >
                {rowsOf(group.templates)}
              </PageSection>
            ))}
          </div>

          {/* Desktop: the full picture, as one table in the same order. */}
          <div className="hidden overflow-hidden rounded-card bg-surface shadow-card xl:block">
            <table className="w-full border-collapse text-base">
              <caption className="sr-only">{t("title")}</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    {t("columns.list")}
                  </th>
                  <th scope="col" className={th}>
                    {t("columns.when")}
                  </th>
                  <th scope="col" className={th}>
                    {t("columns.to")}
                  </th>
                  <th scope="col" className={th}>
                    {t("columns.from")}
                  </th>
                  <th scope="col" className={th}>
                    {t("columns.items")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((group) =>
                  group.templates.map((row) => (
                    <tr key={row.id}>
                      <td className={td}>
                        <Link
                          href={editorOf(row.id)}
                          className="-my-2 flex min-h-11 items-center gap-2 rounded-[10px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {row.name}
                          {row.fromDepartment ? (
                            <Badge tone="neutral">{t("order")}</Badge>
                          ) : null}
                        </Link>
                      </td>
                      <td className={cn(td, "text-ink-2")}>
                        <span className="flex flex-wrap items-center gap-2">
                          {timesWords(row) ?? "—"}
                          {goneBadge(row)}
                        </span>
                      </td>
                      <td className={cn(td, "text-ink-2")}>
                        {recipientWords(row)}
                      </td>
                      <td className={cn(td, "text-ink-2")}>
                        {fromWords(row) ?? "—"}
                      </td>
                      <td className={cn(td, "text-ink-2")}>
                        {t("items", { count: row.items })}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data.removed.length > 0 ? (
        <details className="group flex flex-col gap-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-full px-1 font-bold text-lg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden md:max-w-2xl">
            {t("removedTitle", { count: data.removed.length })}
            <ChevronDown
              aria-hidden="true"
              className="size-5 text-ink-2 transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <ListGroup className="mt-3 md:max-w-2xl">
            {data.removed.map((row) => (
              <div
                key={row.id}
                className="relative flex min-h-16 items-center gap-3 ps-4 pe-1.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
              >
                <span className="flex min-w-0 flex-1 flex-col py-2.5">
                  <span className="font-medium text-ink">{row.name}</span>
                  <span className="text-ink-2 text-sm">
                    {t("items", { count: row.items })}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  loading={pending && restoring === row.id}
                  aria-label={t("restoreOf", { name: row.name })}
                  onClick={() => bringBack(row, false)}
                  className="shrink-0"
                >
                  {t("restore")}
                </Button>
              </div>
            ))}
          </ListGroup>
        </details>
      ) : null}
    </PageBody>
  );
}

"use client";

import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { ChefHat, MonitorSmartphone, Receipt, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { changeTicket, markSeen } from "../../changes";
import { orderDemoDepartments, READER } from "../../data";
import { useOrderDemo } from "../../demo-store";
import type { DepartmentKey, Ticket } from "../../model";
import {
  departmentName,
  ltr,
  paths,
  personName,
  placeById,
  placeTitle,
  prepStatus,
  recentlyReady,
  TicketView,
  toMake,
  useOrderWords,
  useUndoToast,
} from "../../parts";

/**
 * "הכנה" on a phone (§4.2): the same tickets a kitchen screen shows, for
 * someone who prepares from their own phone, here a manager, who may mark
 * any department's tickets ready. Phone: one column; tablet: two; desktop:
 * a grid. "מוכן" puts a ticket in "מוכנים לאחרונה" for five minutes, to put
 * back. Under them, locking this device as the kitchen's or the till's
 * screen (§4.1), which the demo opens.
 */
export function PrepScreen() {
  const { t, time } = useOrderWords();
  const { data, now, update } = useOrderDemo();
  const { say, toast } = useUndoToast();
  const heading = useRef<HTMLHeadingElement>(null);
  const [department, setDepartment] = useState<DepartmentKey>("kitchen");
  const tickets = toMake(data, department);
  const recent = recentlyReady(data, department, now);
  const unseen = tickets
    .filter(({ ticket }) => !ticket.seen && !ticket.held)
    .map(({ ticket }) => ticket.id)
    .join(" ");

  // On a screen now: the sender reads "על המסך" for these.
  useEffect(() => {
    if (unseen) update((d) => markSeen(d, unseen.split(" ")));
  }, [unseen, update]);

  function ready(ticket: Ticket, place: string) {
    update((d) =>
      changeTicket(d, ticket.id, {
        state: "ready",
        readyAt: now,
        readyBy: READER,
      }),
    );
    say(
      t("toast.ready", {
        place,
        department: departmentName(ticket.department),
      }),
      () => update((d) => changeTicket(d, ticket.id, { state: "new" })),
      { focus: true, after: () => heading.current },
    );
  }

  function putBack(ticket: Ticket, place: string) {
    update((d) => changeTicket(d, ticket.id, { state: "new" }));
    say(t("toast.putBack", { place }));
    heading.current?.focus({ preventScroll: true });
  }

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.app, label: t("leave") }}
        eyebrow={t("mode")}
        title={t("prep.title")}
        headingRef={heading}
        // With nothing to make, the empty state below says so, once.
        subtitle={
          tickets.length > 0 ? prepStatus(t, data, department, now) : undefined
        }
      />
      <Segmented
        label={t("prep.department")}
        value={department}
        onChange={setDepartment}
        className="self-start"
        options={orderDemoDepartments.map(({ key, name }) => {
          const count = toMake(data, key).filter(
            ({ ticket }) => !ticket.held,
          ).length;
          return {
            value: key,
            label: name,
            badge: { count, label: t("prep.openCount", { count }) },
          };
        })}
      />
      {tickets.length === 0 ? (
        <EmptyState
          headingLevel="h2"
          icon={<ChefHat />}
          title={t("prep.empty.title")}
          body={t("prep.empty.body")}
        />
      ) : (
        <ul
          aria-label={t("prep.listLabel", {
            department: departmentName(department),
          })}
          className="grid gap-4 md:grid-cols-2 md:items-start xl:grid-cols-3"
        >
          {tickets.map(({ order, round, ticket }) => {
            const place = placeById(data, order.placeId);
            const name = place ? placeTitle(t, place) : "";
            return (
              <li key={ticket.id}>
                <TicketView
                  t={t}
                  ticket={ticket}
                  round={round}
                  place={name}
                  now={now}
                  onReady={() => ready(ticket, name)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {recent.length > 0 ? (
        <PageSection title={t("prep.recent")}>
          <ul className="overflow-hidden rounded-card bg-surface shadow-card md:max-w-2xl">
            {recent.map(({ order, ticket }) => {
              const place = placeById(data, order.placeId);
              const name = place ? placeTitle(t, place) : "";
              return (
                <li
                  key={ticket.id}
                  className="relative flex min-h-16 items-center gap-3 px-4 py-2.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{name}</span>
                    <span className="text-ink-2 text-sm">
                      {t.rich("prep.readyAt", {
                        time: time(ticket.readyAt ?? now),
                        name: personName(ticket.readyBy) || t("station.screen"),
                        ltr,
                      })}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    className="shrink-0 px-3"
                    onClick={() => putBack(ticket, name)}
                  >
                    <Undo2 aria-hidden="true" />
                    {t("prep.putBack")}
                    <span className="sr-only">
                      {t("draft.forItem", { name })}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </PageSection>
      ) : null}
      <PageSection title={t("prep.devices")}>
        <ListGroup className="md:max-w-2xl">
          <ListRow
            href={paths.kitchen}
            leading={<MonitorSmartphone />}
            title={t("prep.lockKitchen")}
            subtitle={t("prep.lockKitchenHint")}
          />
          <ListRow
            href={paths.counter}
            leading={<Receipt />}
            title={t("prep.lockTill")}
            subtitle={t("prep.lockTillHint")}
          />
        </ListGroup>
      </PageSection>
      {toast}
    </PageBody>
  );
}

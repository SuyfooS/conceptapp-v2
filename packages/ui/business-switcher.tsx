"use client";

import { accentTokens } from "@domain/color";
import { ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { accentProps } from "./accent";
import { Badge } from "./badge";
import { ChoiceMenu } from "./choice-menu";
import { cn } from "./cn";
import { leaveBusiness } from "./leaving-business";
import { ListGroup, ListRow } from "./list-row";
import { Sheet } from "./sheet";
import { Spinner } from "./spinner";

/**
 * Switching between the businesses one login is in (payroll P3b): an
 * accountant who keeps the books of several, or someone on one staff who
 * keeps another's books. Shown only to someone with more than one. The same
 * words and the same order everywhere: on Home and in a sheet from the
 * profile on phones and tablets, and on the sidebar on a desktop. Each
 * business has its mark in its own colour, its name, the person's role there
 * and their unread lines there; the one they are in now is marked. A switch
 * is a form sent to a server action, never a link.
 */

export type BusinessChoice = {
  id: string;
  name: string;
  /** Its own colour, as stored: its mark is drawn in it. */
  accent: string;
  /** The person's role there, in words. */
  role: string;
  /** Their unread lines there. */
  unread: number;
  /** The business they are in now. */
  current: boolean;
};

/** The switch: a server action taking a form with `business`, the id. */
export type ChooseBusiness = (form: FormData) => void | Promise<void>;

/**
 * A business's mark: its first letter on its colour, in the same rounded
 * square everywhere: the sidebar's, the switcher's rows and the menu's (a
 * person's avatar is round). In its own colour when `accent` is given, else
 * in the colour around it. `small` is the menu's.
 */
export function BusinessMark({
  name,
  accent,
  small = false,
  className,
}: {
  name: string;
  accent?: string;
  small?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      {...(accent ? accentProps(accentTokens(accent)) : {})}
      className={cn(
        "flex shrink-0 items-center justify-center bg-accent font-bold text-accent-ink",
        small ? "size-8 rounded-[11px] text-sm" : "size-10 rounded-control",
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** The person's role there, and their unread lines when there are any. */
function useAbout(): (business: BusinessChoice) => string {
  const t = useTranslations("ui.businesses");
  return (business) =>
    business.unread > 0
      ? `${business.role} · ${t("unread", { count: business.unread })}`
      : business.role;
}

/**
 * What is unread in the businesses the person isn't in now: how many lines,
 * and in how many of them, for "2 התראות חדשות בעסק אחר".
 */
function unreadElsewhere(businesses: BusinessChoice[]): {
  count: number;
  businesses: number;
} {
  const others = businesses.filter(
    (business) => !business.current && business.unread > 0,
  );
  return {
    count: others.reduce((sum, business) => sum + business.unread, 0),
    businesses: others.length,
  };
}

/** One business in the list: the one they are in now, or a switch to it. */
function BusinessRow({ business }: { business: BusinessChoice }) {
  const t = useTranslations("ui.businesses");
  const about = useAbout();
  const { pending, data } = useFormStatus();
  const leading = (
    <BusinessMark name={business.name} accent={business.accent} />
  );
  if (business.current) {
    return (
      <ListRow
        current
        leading={leading}
        title={business.name}
        subtitle={about(business)}
        trailing={<Badge tone="accent">{t("here")}</Badge>}
      />
    );
  }
  const going = pending && data?.get("business") === business.id;
  return (
    <ListRow
      submit
      name="business"
      value={business.id}
      disabled={pending}
      leading={leading}
      title={business.name}
      subtitle={about(business)}
      trailing={going ? <Spinner /> : null}
    />
  );
}

/**
 * The businesses as a grouped list, each a press away. One form, so the rows
 * keep the list's hairlines; a row sends its own id, and works before the
 * page's script has loaded. Sending it first tells any screen still holding
 * a write to send it (`leaveBusiness`). In a sheet, its cards are the
 * sheet's.
 */
export function BusinessList({
  businesses,
  action,
  inSheet = false,
  className,
}: {
  businesses: BusinessChoice[];
  action: ChooseBusiness;
  inSheet?: boolean;
  className?: string;
}) {
  return (
    <form
      action={action}
      // Before the switch is sent: what a screen holds goes out first, while
      // the cookie still names the business it was made in.
      onSubmit={() => void leaveBusiness()}
      className={className}
    >
      <ListGroup className={inSheet ? "bg-elevated" : undefined}>
        {businesses.map((business) => (
          <BusinessRow key={business.id} business={business} />
        ))}
      </ListGroup>
    </form>
  );
}

/**
 * A row that opens the list in a sheet, for a screen that isn't Home: "החלפת
 * עסק", with the business they are in now under it, and what is unread in
 * the others ("2 התראות חדשות בעסק אחר").
 */
export function BusinessSwitchRow({
  businesses,
  action,
  className,
}: {
  businesses: BusinessChoice[];
  action: ChooseBusiness;
  className?: string;
}) {
  const t = useTranslations("ui.businesses");
  const [open, setOpen] = useState(false);
  const current = businesses.find((business) => business.current);
  const elsewhere = unreadElsewhere(businesses);
  return (
    <>
      <ListGroup className={className}>
        <ListRow
          onClick={() => setOpen(true)}
          leading={<ArrowLeftRight />}
          title={t("switch")}
          subtitle={current ? t("now", { name: current.name }) : undefined}
          trailing={
            elsewhere.count > 0 ? (
              <Badge tone="accent">{t("unreadElsewhere", elsewhere)}</Badge>
            ) : null
          }
        />
      </ListGroup>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        closeLabel={t("close")}
      >
        <BusinessList businesses={businesses} action={action} inSheet />
      </Sheet>
    </>
  );
}

/**
 * The desktop's switch, on the sidebar where the business is named: its name
 * as a quiet menu, each business with its mark, the person's role and their
 * unread lines there. What is unread in the others shows under the name
 * without opening it, as the list's rows show it on Home, and the menu's
 * name says it too. A switch waits for any write a screen still holds
 * (`leaveBusiness`), so that write runs in the business it was made in.
 */
export function BusinessMenu({
  businesses,
  action,
  className,
}: {
  businesses: BusinessChoice[];
  action: ChooseBusiness;
  className?: string;
}) {
  const t = useTranslations("ui.businesses");
  const about = useAbout();
  const [pending, start] = useTransition();
  const current =
    businesses.find((business) => business.current) ?? businesses[0];
  if (!current) return null;
  const elsewhere = unreadElsewhere(businesses);
  return (
    <span
      className={cn("flex min-w-0 flex-col items-start gap-0.5", className)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <ChoiceMenu
          label={
            elsewhere.count > 0
              ? t("menuUnread", { name: current.name, ...elsewhere })
              : t("menu", { name: current.name })
          }
          value={current.id}
          options={businesses.map((business) => ({
            key: business.id,
            label: business.name,
            leading: (
              <BusinessMark
                name={business.name}
                accent={business.accent}
                small
              />
            ),
            hint: about(business),
          }))}
          onChange={(key) => {
            if (key === current.id || pending) return;
            start(async () => {
              await leaveBusiness();
              const form = new FormData();
              form.set("business", key);
              await action(form);
            });
          }}
          className="min-w-0 text-start font-bold text-md text-ink"
        />
        {pending ? <Spinner className="size-4 shrink-0 text-ink-2" /> : null}
      </span>
      {elsewhere.count > 0 ? (
        // The menu's name says it already, for a screen reader.
        <Badge tone="accent" aria-hidden="true">
          {t("unreadElsewhere", elsewhere)}
        </Badge>
      ) : null}
    </span>
  );
}

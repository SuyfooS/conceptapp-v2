"use client";

import {
  type FileStep,
  previousFileStep,
  type StepState,
} from "@domain/employee-file-steps";
import { type AddressForm, formArg, type ProfileLocale } from "@domain/profile";
import { cn } from "@ui/cn";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import { ArrowRight, ChevronRight, Info } from "lucide-react";
import Link from "next/link";
import { useFormatter, type useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { FileActions, FileScreenData } from "./file-types";

/** The flow's words: `app.file`, in the person's language. */
export type FileT = ReturnType<typeof useTranslations<"app.file">>;

/** What every step of the flow shares: the file, the words, the way on. */
export type Kit = {
  data: FileScreenData;
  states: Record<FileStep, StepState>;
  actions: FileActions;
  t: FileT;
  /**
   * Opens a step (or the done screen) by its address, so "back" works; in
   * the language just saved, when it changed (the twin keeps it there).
   */
  go: (step: FileStep | "done", locale?: ProfileLocale) => void;
  /**
   * After a language was saved: the app reads the profile again on its
   * own; the twin, which keeps nothing, opens the same screen in it.
   */
  showLocale: (locale: ProfileLocale) => void;
  /** Where "אמשיך אחר כך" leads: the profile. */
  profileHref: string;
  /** A short line in the toast. */
  say: (message: string) => void;
  /** "למה מבקשים את הפרטים האלה". */
  openNotice: () => void;
  /** The form of address the ICU selects read: "x" until one is chosen. */
  form: AddressForm;
};

/** Numbers and dates inside words, left to right (`<ltr>` in the messages). */
export const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** A day, `YYYY-MM-DD`, with its month in words: never read the wrong way round. */
export function useDay(): (day: string) => string {
  const format = useFormatter();
  return (day) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
}

/** The words a choice of form reads, with the business: `{form}` and `{business}`. */
export const formArgs = (kit: Kit) => ({
  form: formArg(kit.form),
  business: kit.data.businessName,
});

/** A step's title, or the done screen's: where the focus goes when it opens. */
export const titleId = (step: FileStep | "done") => `file-${step}-title`;

/**
 * One step of the file, drawn once: on a phone and a tablet only while it is
 * the step on screen, on a desktop always, one under the other. `?step=`
 * scrolls a desktop to it. Its title takes the focus when it opens, so a
 * keyboard or a screen reader goes on from there. On a phone and a tablet
 * the step says why its details are asked; a desktop has the summary's one
 * way to the notice, beside every step.
 */
export function FileSection({
  step,
  active,
  kit,
  children,
}: {
  step: FileStep;
  active: boolean;
  kit: Kit;
  children: ReactNode;
}) {
  return (
    <section
      id={`file-${step}`}
      aria-labelledby={titleId(step)}
      className={cn(
        "min-w-0 scroll-mt-8 flex-col gap-4",
        active ? "flex" : "hidden xl:flex",
      )}
    >
      <h2
        id={titleId(step)}
        tabIndex={-1}
        className="text-balance px-1 font-bold text-xl outline-none"
      >
        {kit.t(`steps.name.${step}`)}
      </h2>
      {children}
      <div className="flex flex-wrap items-center gap-x-4 px-1 xl:hidden">
        <WhyButton kit={kit} />
      </div>
    </section>
  );
}

/**
 * The focus, once what held it went away (a step left, a code taken, a
 * button gone): a step's title, or the first field inside a part just
 * opened (`tabIndex` -1 titles take it without a ring). Once drawn: the
 * frame after.
 */
export function focusTitle(step: FileStep | "done") {
  requestAnimationFrame(() => {
    document.getElementById(titleId(step))?.focus({ preventScroll: true });
  });
}

/**
 * The first field inside, once drawn (read then: the part may open with
 * the press), brought into view.
 */
export function focusFirstField(root: {
  readonly current: HTMLElement | null;
}) {
  requestAnimationFrame(() => {
    root.current
      ?.querySelector<HTMLElement>(
        "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), button:not([disabled])",
      )
      ?.focus();
  });
}

/** "למה מבקשים את זה": the notice, one tap away on every step. */
export function WhyButton({ kit, label }: { kit: Kit; label?: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={kit.openNotice}
      className="pressable flex min-h-11 items-center gap-1.5 self-start rounded-full font-medium text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Info aria-hidden="true" className="size-4 shrink-0" />
      {label ?? kit.t("why")}
    </button>
  );
}

/** A field's reason under it, quiet. */
export function Reason({ children }: { children: ReactNode }) {
  return <p className="px-1 text-ink-2 text-sm">{children}</p>;
}

/**
 * A step's main action on a phone and a tablet, floating above the tab bar,
 * with "חזרה" beside it; on a desktop each section has its own quiet save
 * and the summary holds the page's one main action. A main action that
 * can't go yet says why in words above it: it waits only while something is
 * missing, which the notice counts; with everything filled in it can be
 * pressed, and a step that still can't save says each problem under its
 * field (`showFirstProblem`). Room is kept under the page so nothing hides
 * behind it.
 */
export function StepDock({
  kit,
  step,
  main,
  notice,
}: {
  kit: Kit;
  step: FileStep;
  main?: {
    label: string;
    /** The form it sends, or what it does. */
    form?: string;
    onClick?: () => void;
    disabled?: boolean;
    pending?: boolean;
  };
  notice?: ReactNode;
}) {
  const back = previousFileStep(step);
  return (
    <div className="xl:hidden">
      <div aria-hidden="true" className={notice ? "h-36" : "h-28"} />
      <FloatingDock
        notice={
          notice ? (
            <p
              role="status"
              className="glass mx-auto w-fit rounded-[22px] px-4 py-2 text-center font-medium text-base"
            >
              {notice}
            </p>
          ) : undefined
        }
      >
        {back ? (
          <DockButton
            tone="quiet"
            icon={
              <ChevronRight aria-hidden="true" className="ltr:-scale-x-100" />
            }
            onClick={() => kit.go(back)}
          >
            {kit.t("actions.back")}
          </DockButton>
        ) : null}
        {main ? (
          <DockButton
            type={main.form ? "submit" : "button"}
            form={main.form}
            onClick={main.onClick}
            disabled={main.disabled}
            loading={main.pending}
            icon={
              <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
            }
          >
            {main.label}
          </DockButton>
        ) : null}
      </FloatingDock>
    </div>
  );
}

/**
 * "אמשיך אחר כך": the quiet way back to the profile, the step kept. On a
 * phone and a tablet only: a desktop shows every step at once, and its way
 * back is the one above them.
 */
export function LaterLink({ kit }: { kit: Kit }) {
  return (
    <Link
      href={kit.profileHref}
      className="pressable flex min-h-11 items-center self-start rounded-full font-medium text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent xl:hidden"
    >
      {kit.t("actions.later")}
    </Link>
  );
}

/**
 * The first field in a form that says what is wrong with it, or null. A
 * step saves with none, so nothing goes while a field says it is wrong: a
 * town or a country typed and not chosen from the list included, which only
 * its field knows.
 */
export function firstProblem(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>('[aria-invalid="true"]');
}

/**
 * After a save that can't go yet: the first field that says what is wrong
 * comes into view, clear of the dock, and takes the focus, so its words are
 * seen and read out. Once the words are drawn, the frame after.
 */
export function showFirstProblem(form: HTMLFormElement) {
  requestAnimationFrame(() => {
    const field = firstProblem(form);
    if (!field) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    field.scrollIntoView({
      block: "center",
      behavior: reduce ? "auto" : "smooth",
    });
    field.focus({ preventScroll: true });
  });
}

/** A refusal in words, beside the action it refused. */
export function Failure({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="px-1 text-danger text-sm">
      {children}
    </p>
  ) : null;
}

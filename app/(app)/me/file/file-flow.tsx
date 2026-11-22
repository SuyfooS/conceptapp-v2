"use client";

import {
  FILE_STEPS,
  type FileStep,
  fileStepStates,
  isNewFile,
  pensionDue,
  resumeStep,
  type StepState,
  sendBlocker,
  stepsDone,
} from "@domain/employee-file-steps";
import { formArg, type ProfileLocale } from "@domain/profile";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import { PageBody, PageHeader } from "@ui/page";
import { StatusToast } from "@ui/status-toast";
import { StepList, StepRow } from "@ui/step-list";
import { Steps } from "@ui/steps";
import { VisibilityNote } from "@ui/visibility-note";
import { ArrowRight, ChevronRight, Languages, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { failureKey } from "./failure-words";
import type {
  FileActionFailure,
  FileActions,
  FileScreenData,
} from "./file-types";
import { focusTitle, type Kit, titleId, useDay, WhyButton } from "./flow-kit";
import { NoticeSheet } from "./notice-sheet";
import { AddressStep } from "./steps/address-step";
import { type BankPreset, BankStep } from "./steps/bank-step";
import { Form101Step } from "./steps/form101-step";
import { IdentityStep } from "./steps/identity-step";
import { PensionStep } from "./steps/pension-step";
import { StartStep } from "./steps/start-step";

/** Where the screen opens: a step, the done screen, or (nothing) where the file says. */
export type FileView = FileStep | "done" | null;

const MARK: Record<StepState, "done" | "open"> = {
  done: "done",
  direct: "done",
  open: "open",
};

/** Whether the screen is a desktop's, where every step shows at once. */
const desktop = () => window.matchMedia("(min-width: 80rem)").matches;

/**
 * The worker's own file as a flow (profile H5a), the same render in every
 * shape: on a phone one step at a time under the steps bar, with its main
 * action floating above the tab bar; on a tablet the steps beside the one on
 * screen; on a desktop every step one under the other, and beside them the
 * steps, what is still missing and the page's one main action. A new file
 * opens on its welcome; after that, on the first step still open. Each step
 * is an address (`?step=`), so "back" and a link from the profile work, and
 * a step opened takes the focus at its title. The file is sent only once
 * its details are in (`sendBlocker`): until then the send action leads to
 * the first one still open. Also drawn by the twin on /design/shell/me/file.
 */
export function FileFlow({
  data,
  view,
  actions,
  base,
  profileHref,
  keep,
  preset,
}: {
  data: FileScreenData;
  view: FileView;
  actions: FileActions;
  /** "" in the app, "/design/shell" on the twin. */
  base: string;
  profileHref: string;
  /**
   * The twin's own query (its state and language) in each language, kept
   * from step to step: the twin keeps nothing, so a language saved there
   * is its address. The app reads the profile again instead.
   */
  keep?: Record<ProfileLocale, string>;
  /** The twin's: a state to open the bank step on. */
  preset?: { bank?: BankPreset };
}) {
  const t = useTranslations("app.file");
  const router = useRouter();
  const day = useDay();
  const summaryId = useId();
  const pageTitle = useRef<HTMLHeadingElement>(null);
  const [notice, setNotice] = useState(false);
  const [toast, setToast] = useState<{ message: string; stamp: string } | null>(
    null,
  );
  const [switching, setSwitching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailure, setSendFailure] = useState<FileActionFailure | null>(
    null,
  );

  const states = fileStepStates({
    addressForm: data.addressForm,
    asked: data.asked,
    missing: data.missing,
    directGroups: data.file?.direct_groups ?? [],
    pensionAnswer: data.file?.pension_answer ?? null,
    form101: data.taxYear
      ? { status: data.taxYear.status, route: data.taxYear.route }
      : null,
  });
  const isNew = isNewFile(data.file);
  const resume = resumeStep(states);
  const current =
    view ??
    (isNew ? ("welcome" as const) : resume === "done" ? "done" : resume);
  const step: FileStep =
    current === "welcome" || current === "done" ? "start" : current;
  const business = data.businessName;
  // What keeps the file from going: the send action leads there instead.
  const blocker = sendBlocker(states);

  // A step's address (or, with none, the file's own: the welcome), with the
  // twin's query in the language asked.
  const stepHref = (next: FileStep | "done" | null, locale = data.locale) => {
    const kept = keep?.[locale] ?? "";
    if (next === null) return `${base}/me/file${kept ? `?${kept}` : ""}`;
    return `${base}/me/file?step=${next}${kept ? `&${kept}` : ""}`;
  };
  const go = (next: FileStep | "done" | null, locale?: ProfileLocale) =>
    router.push(stepHref(next, locale), { scroll: false });
  // The same screen in another language: the twin's address holds it.
  const showLocale = (locale: ProfileLocale) => {
    if (keep && locale !== data.locale) {
      go(current === "welcome" ? null : current, locale);
    }
  };
  // A step to finish: opened, or, already the one on screen (a desktop's
  // summary beside it), brought back into view with the focus at its title.
  const finish = (next: FileStep) => {
    if (current !== next) {
      go(next);
      return;
    }
    document.getElementById(`file-${next}`)?.scrollIntoView({ block: "start" });
    focusTitle(next);
  };
  // Where the welcome's way in leads: on where the person stopped (step 0
  // is the profile's, so a file can be new with it done).
  const startFilling = () => finish(resume === "done" ? "start" : resume);

  // A step opened by its address, or picked up where the person stopped: a
  // phone and a tablet start at its top, a desktop scrolls to it among the
  // others (the first step is the page's top already). Opened from another,
  // its title takes the focus, since what held it (the dock's button, a
  // step's link) went away or is behind: a keyboard and a screen reader go
  // on from the step, not from the top of the page. Never on arrival.
  const first = useRef(true);
  useEffect(() => {
    const opening = first.current;
    first.current = false;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (current === "welcome" || current === "done") {
      if (opening) return;
      window.scrollTo({ top: 0 });
      const title =
        current === "done"
          ? document.getElementById(titleId("done"))
          : pageTitle.current;
      title?.focus({ preventScroll: true });
      return;
    }
    if (desktop()) {
      if (opening && current === "start") return;
      document.getElementById(`file-${current}`)?.scrollIntoView({
        block: "start",
        behavior: reduce ? "auto" : "smooth",
      });
    } else if (!opening) {
      window.scrollTo({ top: 0 });
    }
    if (!opening) {
      document.getElementById(titleId(current))?.focus({ preventScroll: true });
    }
  }, [current]);

  const kit: Kit = {
    data,
    states,
    actions,
    t,
    go,
    showLocale,
    profileHref,
    say: (message) => setToast({ message, stamp: Date.now().toString() }),
    openNotice: () => setNotice(true),
    form: formArg(data.addressForm),
  };

  async function switchLanguage() {
    if (switching) return;
    setSwitching(true);
    const next = data.locale === "en" ? "he" : "en";
    const result = await actions
      .saveProfile({ locale: next })
      .catch(() => ({ ok: false }) as const);
    setSwitching(false);
    if (!result.ok) kit.say(t("language.failed"));
    else showLocale(next);
  }

  async function send() {
    if (sending) return;
    if (blocker) {
      finish(blocker);
      return;
    }
    setSending(true);
    setSendFailure(null);
    const result = await actions
      .submit()
      .catch(() => ({ ok: false, failure: "failed" }) as const);
    setSending(false);
    if (!result.ok) {
      setSendFailure(result.failure);
      return;
    }
    go("done");
  }

  const done = stepsDone(states);
  const missingSteps = FILE_STEPS.filter((s) => states[s] === "open");
  const due = pensionDue(data.pensionDueOn, data.today);
  const sendWords = sendFailure
    ? t(`failures.${failureKey(sendFailure)}`)
    : null;
  // A step handed in directly is done, and says how under its name: the
  // words a screen reader hears after the name are said once.
  const stepRow = (s: FileStep, link: boolean) => (
    <StepRow
      key={s}
      mark={MARK[states[s]]}
      title={t(`steps.name.${s}`)}
      state={t(`steps.state.${states[s] === "direct" ? "done" : states[s]}`)}
      detail={states[s] === "direct" ? t("steps.state.direct") : undefined}
      href={link ? stepHref(s) : undefined}
      current={link && current === s}
    />
  );

  // The card over the hero's foot stays in the flow, so longer words (a
  // narrow phone, larger text) push down rather than up over the title. On
  // a desktop it holds the welcome's way in, the page's one main action
  // while nothing is in yet; a phone and a tablet have it in the dock.
  const hero = (
    <div className="flex flex-col">
      <Card tone="hero" padding="none" className="px-5 pt-6 pb-16">
        <p className="text-balance font-bold text-accent-ink text-xl">
          {t("welcome.title", { business })}
        </p>
      </Card>
      <Card
        tone="float"
        padding="lg"
        className="relative z-10 mx-4 -mt-12 flex flex-col gap-1"
      >
        <CardText className="text-ink">
          {t("welcome.body", { count: FILE_STEPS.length })}
        </CardText>
        <div className="hidden pt-3 xl:flex">
          <Button size="lg" onClick={startFilling}>
            <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
            {t("welcome.start")}
          </Button>
        </div>
      </Card>
    </div>
  );

  // The summary's action on a desktop: the send once the details are in;
  // until then the way to the first still open, the page's main action
  // unless the welcome above holds it.
  const summaryAction = blocker ? (
    <Button
      size="lg"
      variant={isNew ? "secondary" : "primary"}
      onClick={() => finish(blocker)}
    >
      <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
      {t(`actions.finish.${blocker}`)}
    </Button>
  ) : (
    <Button size="lg" loading={sending} onClick={send}>
      <Send aria-hidden="true" className="rtl:-scale-x-100" />
      {t("actions.send", { business })}
    </Button>
  );

  return (
    <PageBody className="max-w-6xl">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={profileHref}
            className="pressable -ms-1 flex min-h-11 items-center gap-0.5 rounded-full pe-3 font-medium text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronRight
              aria-hidden="true"
              className="size-5 ltr:-scale-x-100"
            />
            {t("back")}
          </Link>
          <Button
            variant="ghost"
            loading={switching}
            onClick={switchLanguage}
            lang={data.locale === "en" ? "he" : "en"}
            className="text-ink-2"
          >
            {switching ? null : <Languages aria-hidden="true" />}
            {t("language.switch")}
          </Button>
        </div>
        <PageHeader
          title={t("title", { business })}
          subtitle={t("progress", { done, count: FILE_STEPS.length })}
          headingRef={pageTitle}
        />
      </div>

      {current === "done" ? (
        <DoneView kit={kit} stepRow={stepRow} />
      ) : (
        <>
          {current === "welcome" ? (
            <div className="flex flex-col gap-4">
              {hero}
              <div className="xl:hidden">
                <WhyButton kit={kit} label={t("notice.title")} />
              </div>
            </div>
          ) : isNew ? (
            <div className="hidden xl:block">{hero}</div>
          ) : null}

          <div
            className={cn(
              "grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-8 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]",
              current === "welcome" && "hidden xl:grid",
            )}
          >
            {/* Never taller than the screen: on a desktop the steps and
                what is missing scroll inside it when they don't fit, with
                room around them for the steps' lifted shadow, and the
                page's main action stays at its foot, in view on a laptop
                for a new file too. A tablet's six steps always fit. */}
            <aside
              aria-label={t("steps.title")}
              className="hidden min-w-0 flex-col gap-3 md:sticky md:top-8 md:flex md:max-h-[calc(100dvh-env(safe-area-inset-bottom)-10.5rem)] xl:order-last xl:max-h-[calc(100dvh-4rem)]"
            >
              <div className="flex min-h-0 flex-col gap-4 xl:-mx-8 xl:-mt-2 xl:overflow-y-auto xl:px-8 xl:pt-2 xl:pb-4">
                <StepList className="shrink-0">
                  {FILE_STEPS.map((s) => stepRow(s, true))}
                </StepList>
                <div className="hidden shrink-0 flex-col gap-3 xl:flex">
                  <Card padding="lg" className="flex flex-col gap-2">
                    <h2 id={summaryId} className="font-semibold text-md">
                      {t("summary.title")}
                    </h2>
                    {missingSteps.length === 0 ? (
                      <p className="text-base text-ink-2">
                        {t("summary.none")}
                      </p>
                    ) : (
                      <ul
                        aria-labelledby={summaryId}
                        className="flex flex-col gap-1 text-base"
                      >
                        {missingSteps.map((s) => (
                          <li key={s}>{t(`steps.name.${s}`)}</li>
                        ))}
                      </ul>
                    )}
                    {due.kind === "open" ? (
                      <p className="text-ink-2 text-sm">
                        {t("pension.dueOn", { date: day(due.dueOn), business })}
                      </p>
                    ) : null}
                  </Card>
                  <VisibilityNote icon="lock" className="px-1">
                    {t("visible")}
                  </VisibilityNote>
                  <WhyButton kit={kit} label={t("notice.title")} />
                </div>
              </div>
              <div className="hidden shrink-0 flex-col gap-3 xl:flex">
                {summaryAction}
                {blocker ? (
                  <p className="px-1 text-ink-2 text-sm">
                    {t("actions.sendWaits")}
                  </p>
                ) : null}
                {sendWords ? (
                  <p role="alert" className="px-1 text-danger text-sm">
                    {sendWords}
                  </p>
                ) : null}
              </div>
            </aside>

            <div className="flex min-w-0 flex-col gap-10">
              <Steps
                className="md:hidden"
                count={FILE_STEPS.length}
                current={FILE_STEPS.indexOf(step) + 1}
                label={t("steps.count", {
                  current: FILE_STEPS.indexOf(step) + 1,
                  count: FILE_STEPS.length,
                })}
              />
              <StartStep kit={kit} active={step === "start"} />
              <IdentityStep kit={kit} active={step === "identity"} />
              <AddressStep kit={kit} active={step === "address"} />
              <BankStep
                kit={kit}
                active={step === "bank"}
                preset={preset?.bank}
              />
              <PensionStep kit={kit} active={step === "pension"} />
              <Form101Step
                kit={kit}
                active={step === "form101"}
                blocker={blocker}
                onSend={send}
                sending={sending}
                sendFailure={sendWords}
              />
            </div>
          </div>
        </>
      )}

      {current === "welcome" ? (
        <div className="xl:hidden">
          <div aria-hidden="true" className="h-28" />
          <FloatingDock>
            <DockButton
              icon={
                <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
              }
              onClick={startFilling}
            >
              {t("welcome.start")}
            </DockButton>
          </FloatingDock>
        </div>
      ) : null}

      <NoticeSheet open={notice} onOpenChange={setNotice} business={business} />
      <StatusToast message={toast?.message ?? null} stamp={toast?.stamp} />
    </PageBody>
  );
}

/**
 * Sent, or nothing left to fill: what the business sees now, what is still
 * the person's to do (a pension fund to choose by its day, a step still
 * open), and every step, to change any of them. "סיימת" only once nothing
 * is open; until then it says how many steps are left, and its main action
 * leads to the first. With nothing left, the way back to the profile is.
 */
function DoneView({
  kit,
  stepRow,
}: {
  kit: Kit;
  stepRow: (step: FileStep, link: boolean) => ReactNode;
}) {
  const { t, data, states } = kit;
  const router = useRouter();
  const day = useDay();
  const business = data.businessName;
  const due = pensionDue(data.pensionDueOn, data.today);
  const open = FILE_STEPS.filter((s) => states[s] === "open");
  const next = open[0] ?? null;
  const sent = data.file?.submitted_at != null;
  const main = next
    ? { label: t(`actions.finish.${next}`), go: () => kit.go(next) }
    : {
        label: t("done.profile"),
        go: () => router.push(kit.profileHref),
      };
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-8">
      <Card padding="lg" className="flex flex-col gap-2">
        <h2
          id={titleId("done")}
          tabIndex={-1}
          className="font-bold text-xl outline-none"
        >
          {next ? t("done.titleLeft", { count: open.length }) : t("done.title")}
        </h2>
        {sent || !next ? (
          <p className="text-md">
            {sent ? t("done.sent", { business }) : t("done.body", { business })}
          </p>
        ) : null}
        {due.kind === "open" ? (
          <p className="text-base">
            {t("done.left", {
              what: t("done.leftPension", { date: day(due.dueOn) }),
            })}
          </p>
        ) : null}
        {open.map((s) => (
          <p key={s} className="text-base">
            {t("done.left", { what: t(`steps.name.${s}`) })}
          </p>
        ))}
        <div className="mt-2 hidden xl:flex">
          <Button size="lg" onClick={main.go}>
            <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
            {main.label}
          </Button>
        </div>
      </Card>
      <section
        aria-labelledby="file-done-steps"
        className="flex flex-col gap-3"
      >
        <h2 id="file-done-steps" className="px-1 font-bold text-lg">
          {t("done.change")}
        </h2>
        <StepList>{FILE_STEPS.map((s) => stepRow(s, true))}</StepList>
      </section>
      <div className="xl:hidden">
        <div aria-hidden="true" className="h-28" />
        <FloatingDock>
          <DockButton
            icon={
              <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
            }
            onClick={main.go}
          >
            {main.label}
          </DockButton>
        </FloatingDock>
      </div>
    </div>
  );
}

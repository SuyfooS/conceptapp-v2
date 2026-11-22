"use client";

import {
  type FileStep,
  fileStepStates,
  isNewFile,
  nextFileStep,
  pensionDue,
  previousFileStep,
  resumeStep,
  type SENT_WITH,
  type StepState,
  sendBlocker,
  stepsDone,
} from "@domain/employee-file-steps";
import { formArg, type ProfileLocale } from "@domain/profile";
import { Badge } from "@ui/badge";
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
import { fileStepInputOf, pensionLaterOf } from "./file-parts";
import type {
  FileActionFailure,
  FileActions,
  FileScreenData,
} from "./file-types";
import {
  focusTitle,
  formIdOf,
  type Kit,
  pensionDueWords,
  pensionLaterWords,
  titleId,
  useDay,
  WhyButton,
} from "./flow-kit";
import { NoticeSheet } from "./notice-sheet";
import { AddressStep } from "./steps/address-step";
import {
  type BankPreset,
  type BankScreen,
  BankStep,
  bankHeld,
  useBankScreen,
  useHoldWords,
} from "./steps/bank-step";
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
  optional: "open",
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
 * the first one still open, and on a desktop, with that one on screen
 * already, does its own action instead (it saves, sends the code, or says
 * what is missing and goes there), showing its save on its way, and none
 * while the code's boxes are up (`SummaryFoot`). The steps are the ones
 * the business's settings put on screen (`data.steps`, H5b): with Form 101
 * not taken in the app, the pension's step leads to the done screen, which
 * sends the file. Also drawn by the twin on /design/shell/me/file.
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
  // The account's step keeps where it stands here, its phase with what the
  // phase shows: drawn again after the done screen, it opens as it was,
  // and a desktop's summary offers what its own action does now.
  const bank = useBankScreen(data, preset?.bank);
  // Each step's save on its way (`stepPending`): the summary shows it too.
  const [busy, setBusy] = useState<Kit["busy"]>({});

  const steps = data.steps;
  const states = fileStepStates(fileStepInputOf(data));
  const isNew = isNewFile(data.file);
  const resume = resumeStep(states, steps);
  const current =
    view ??
    (isNew ? ("welcome" as const) : resume === "done" ? "done" : resume);
  const step: FileStep =
    current === "welcome" || current === "done" ? "start" : current;
  const business = data.businessName;
  // What keeps the file from going: the send action leads there instead.
  const blocker = sendBlocker(states, steps);

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
  // Where the welcome's way in leads: on where the person stopped (step 0
  // is the profile's, so a file can be new with it done).
  const startFilling = () => go(resume === "done" ? "start" : resume);

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
    steps,
    next: (from) => nextFileStep(from, steps) ?? "done",
    previous: (from) => previousFileStep(from, steps),
    stepName: (of) =>
      of === "address" && !data.parts.address
        ? t("steps.name.contact")
        : t(`steps.name.${of}`),
    actions,
    t,
    go,
    showLocale,
    profileHref,
    say: (message) => setToast({ message, stamp: Date.now().toString() }),
    openNotice: () => setNotice(true),
    form: formArg(data.addressForm),
    busy,
    setBusy: (s, on) => setBusy((was) => ({ ...was, [s]: on })),
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
      go(blocker);
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
    // Said, as every save is: a screen reader hears it, and the twin, which
    // keeps nothing, answers too. Sent from the done screen itself (Form 101
    // off), the screen stays and the button pressed turns into the way back
    // to the profile, so its title takes the focus here; from step 5, the
    // done screen opening gives it the focus.
    kit.say(t("done.sent", { business }));
    if (current === "done") focusTitle("done");
    go("done");
  }

  const done = stepsDone(states, steps);
  const due = pensionDue(data.pensionDueOn, data.today);
  // The pension answered "אבחר אחר כך" is behind the person, so the file
  // can go, but the file still counts it missing (`pensionLaterOf`): a
  // fund is still theirs to choose, by its day or with the day passed.
  const later = pensionLaterOf(data);
  // What a desktop's summary says is still missing: the steps open, and
  // the pension while a fund is still to choose, as Today's card says.
  const missingSteps = steps.filter(
    (s) => states[s] === "open" || (s === "pension" && later !== null),
  );
  const sendWords = sendFailure
    ? t(`failures.${failureKey(sendFailure)}`)
    : null;
  // A step handed in directly is done, and says how under its name; an
  // optional one says so beside it: the words a screen reader hears after
  // the name are said once. A fund chosen "later" still to choose: the
  // pension's row says by when, or that the day passed, as the profile's
  // does.
  const pensionLater = later ? pensionLaterWords(t, day, later) : undefined;
  const stepRow = (s: FileStep, link: boolean) => (
    <StepRow
      key={s}
      mark={MARK[states[s]]}
      title={kit.stepName(s)}
      state={
        states[s] === "optional"
          ? t("optional")
          : t(`steps.state.${states[s] === "direct" ? "done" : states[s]}`)
      }
      detail={
        states[s] === "direct"
          ? t("steps.state.direct")
          : s === "pension"
            ? pensionLater
            : undefined
      }
      badge={
        states[s] === "optional" ? (
          <Badge aria-hidden="true">{t("optional")}</Badge>
        ) : null
      }
      href={link ? stepHref(s) : undefined}
      current={link && current === s}
    />
  );

  // The card over the hero's foot stays in the flow, so longer words (a
  // narrow phone, larger text) push down rather than up over the title. On
  // a desktop's welcome it holds the way in, the page's one main action
  // while nothing is in yet; a phone and a tablet have it in the dock. On a
  // step, where the way in would lead nowhere new, the summary holds it.
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
          {t("welcome.body", { count: steps.length })}
        </CardText>
        {current === "welcome" ? (
          <div className="hidden pt-3 xl:flex">
            <Button size="lg" onClick={startFilling}>
              <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
              {t("welcome.start")}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
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
          subtitle={t("progress", { done, count: steps.length })}
          headingRef={pageTitle}
        />
      </div>

      {current === "done" ? (
        <DoneView
          kit={kit}
          stepRow={stepRow}
          onSend={send}
          sending={sending}
          sendWords={sendWords}
        />
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
                  {steps.map((s) => stepRow(s, true))}
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
                          <li key={s}>{kit.stepName(s)}</li>
                        ))}
                      </ul>
                    )}
                    {due.kind !== "none" || later ? (
                      <p className="text-ink-2 text-sm">
                        {pensionDueWords(t, day, due, business)}
                      </p>
                    ) : null}
                  </Card>
                  <VisibilityNote icon="lock" className="px-1">
                    {data.parts.emergency
                      ? t("visibleEmergency")
                      : t("visible")}
                  </VisibilityNote>
                  <WhyButton kit={kit} label={t("notice.title")} />
                </div>
              </div>
              <div className="hidden shrink-0 flex-col gap-3 xl:flex">
                <SummaryFoot
                  kit={kit}
                  bank={bank}
                  blocker={blocker}
                  current={current}
                  sending={sending}
                  sendWords={sendWords}
                  onSend={send}
                />
              </div>
            </aside>

            <div className="flex min-w-0 flex-col gap-10">
              <Steps
                className="md:hidden"
                count={steps.length}
                current={steps.indexOf(step) + 1}
                label={t("steps.count", {
                  current: steps.indexOf(step) + 1,
                  count: steps.length,
                })}
              />
              <StartStep kit={kit} active={step === "start"} />
              <IdentityStep kit={kit} active={step === "identity"} />
              {steps.includes("address") ? (
                <AddressStep kit={kit} active={step === "address"} />
              ) : null}
              {steps.includes("bank") ? (
                <BankStep kit={kit} active={step === "bank"} screen={bank} />
              ) : null}
              <PensionStep kit={kit} active={step === "pension"} />
              {steps.includes("form101") ? (
                <Form101Step
                  kit={kit}
                  active={step === "form101"}
                  blocker={blocker}
                  onSend={send}
                  sending={sending}
                  sendFailure={sendWords}
                />
              ) : null}
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

      <NoticeSheet
        open={notice}
        onOpenChange={setNotice}
        business={business}
        names={data.notice}
        form101={data.form101}
        emergency={data.parts.emergency}
      />
      <StatusToast message={toast?.message ?? null} stamp={toast?.stamp} />
    </PageBody>
  );
}

/** The summary's own action: a step's, under its words, doing what it does. */
type OwnAction = {
  label: string;
  /** The step's form it sends, or what it does. */
  form?: string;
  onClick?: () => void;
  /** The week after a phone change: it waits, with its words under it. */
  held?: boolean;
  /** The step's save (or the account's code) on its way. */
  pending?: boolean;
};

/**
 * What the step that keeps the file back, on screen already, offers in the
 * summary: what its own action does now, under the same words, rather than
 * a way to where the person is. Its save on its way shows on it, as on the
 * dock's. The account goes on once it is saved, waits in the week after a
 * phone change, and offers nothing while the code's boxes are up, as the
 * dock doesn't: the code confirms itself once its boxes fill.
 */
function ownAction(
  step: (typeof SENT_WITH)[number],
  kit: Kit,
  bank: BankScreen,
): OwnAction | null {
  const { t, data } = kit;
  const pending = kit.busy[step] === true;
  switch (step) {
    case "identity":
      return {
        label: t("actions.saveIdentity"),
        form: formIdOf(step),
        pending,
      };
    case "address":
      return { label: t("actions.saveAddress"), form: formIdOf(step), pending };
    case "pension":
      return { label: t("actions.savePension"), form: formIdOf(step), pending };
    case "bank":
      return bank.phase === "saved"
        ? {
            label: t("actions.continue"),
            onClick: () => kit.go(kit.next("bank")),
          }
        : bank.phase === "code"
          ? null
          : {
              label: t("bank.confirm"),
              form: formIdOf(step),
              held: bankHeld(bank.hold, data.today),
              pending,
            };
  }
}

/**
 * The foot of a desktop's summary: the page's one main action, and under it
 * why the file waits (or why the account's action does) and a send refused.
 * The send once the details are in; until then the open step's own action
 * when it is on screen already (`ownAction`), or the way to it. Quiet on the
 * welcome, whose card holds the main action.
 */
export function SummaryFoot({
  kit,
  bank,
  blocker,
  current,
  sending,
  sendWords,
  onSend,
}: {
  kit: Kit;
  bank: BankScreen;
  blocker: (typeof SENT_WITH)[number] | null;
  current: FileStep | "welcome" | "done";
  sending: boolean;
  sendWords: string | null;
  onSend: () => void;
}) {
  const { t, data } = kit;
  const holdWords = useHoldWords(kit, bank.hold);
  const quiet = current === "welcome";
  const onScreen = blocker !== null && blocker === current;
  const own = onScreen ? ownAction(blocker, kit, bank) : null;
  const note =
    blocker === null ? null : own?.held ? holdWords : t("actions.sendWaits");
  return (
    <>
      {own ? (
        <Button
          size="lg"
          type={own.form ? "submit" : "button"}
          form={own.form}
          onClick={own.onClick}
          disabled={own.held}
          loading={own.pending}
        >
          <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
          {own.label}
        </Button>
      ) : onScreen ? null : blocker ? (
        <Button
          size="lg"
          variant={quiet ? "secondary" : "primary"}
          onClick={() => kit.go(blocker)}
        >
          <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
          {t(`actions.finish.${blocker}`)}
        </Button>
      ) : (
        <Button
          size="lg"
          variant={quiet ? "secondary" : "primary"}
          loading={sending}
          onClick={onSend}
        >
          <Send aria-hidden="true" className="rtl:-scale-x-100" />
          {t("actions.send", { business: data.businessName })}
        </Button>
      )}
      {note ? <p className="px-1 text-ink-2 text-sm">{note}</p> : null}
      {sendWords ? (
        <p role="alert" className="px-1 text-danger text-sm">
          {sendWords}
        </p>
      ) : null}
    </>
  );
}

/**
 * Sent, or nothing left to fill: what the business sees now, what is still
 * the person's to do (a pension fund to choose by its day, a step still
 * open), and every step, to change any of them. "סיימת" only once nothing
 * is left at all; until then it says how many steps are left, and its main
 * action leads to the first. With nothing open and the file not sent yet,
 * its main action sends it, and a refusal is said under it: with Form 101
 * not taken in the app (H5b) this is where the file goes, so a fund chosen
 * "later" never keeps it back. A fund still to choose (the pension answered
 * "אבחר אחר כך", which the file counts missing: `pensionLaterOf`) is never
 * "סיימת" nor "הכול מוכן", by its day or with the day passed: it is titled
 * so, says the day (or that it passed and a fund can still be chosen), and,
 * sent, "בחירת קרן פנסיה" opens the pension's step; else the way back to
 * the profile.
 */
function DoneView({
  kit,
  stepRow,
  onSend,
  sending,
  sendWords,
}: {
  kit: Kit;
  stepRow: (step: FileStep, link: boolean) => ReactNode;
  onSend: () => void;
  sending: boolean;
  sendWords: string | null;
}) {
  const { t, data, states } = kit;
  const router = useRouter();
  const day = useDay();
  const business = data.businessName;
  const due = pensionDue(data.pensionDueOn, data.today);
  const open = kit.steps.filter((s) => states[s] === "open");
  const next = open[0] ?? null;
  const sent = data.file?.submitted_at != null;
  // A fund chosen "later", which the file still counts missing: by its day,
  // or with the day passed.
  const later = pensionLaterOf(data);
  // No step open, and that fund still to choose: never "סיימת".
  const pensionLeft = next === null && later !== null;
  const main = next
    ? {
        label: t(`actions.finish.${next}`),
        go: () => kit.go(next),
        pending: false,
      }
    : !sent
      ? {
          label: t("actions.send", { business }),
          go: onSend,
          pending: sending,
        }
      : pensionLeft
        ? {
            label: t("actions.choosePension"),
            go: () => kit.go("pension"),
            pending: false,
          }
        : {
            label: t("done.profile"),
            go: () => router.push(kit.profileHref),
            pending: false,
          };
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-8">
      <Card padding="lg" className="flex flex-col gap-2">
        <h2
          id={titleId("done")}
          tabIndex={-1}
          className="font-bold text-xl outline-none"
        >
          {next
            ? t("done.titleLeft", { count: open.length })
            : pensionLeft
              ? t("done.titlePension")
              : t("done.title")}
        </h2>
        {sent || !next ? (
          <p className="text-md">
            {sent
              ? t("done.sent", { business })
              : pensionLeft
                ? t("done.readyPension", { business })
                : t("done.ready", { business })}
          </p>
        ) : null}
        {pensionLeft ? (
          <p className="text-base">
            {pensionDueWords(t, day, later, business)}
          </p>
        ) : later || due.kind === "open" ? (
          <p className="text-base">
            {t("done.left", { what: pensionLaterWords(t, day, later ?? due) })}
          </p>
        ) : null}
        {open.map((s) => (
          <p key={s} className="text-base">
            {t("done.left", { what: kit.stepName(s) })}
          </p>
        ))}
        <div className="mt-2 hidden xl:flex">
          <Button size="lg" onClick={main.go} loading={main.pending}>
            <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
            {main.label}
          </Button>
        </div>
        {!next && !sent && sendWords ? (
          <p role="alert" className="text-danger text-sm">
            {sendWords}
          </p>
        ) : null}
      </Card>
      <section
        aria-labelledby="file-done-steps"
        className="flex flex-col gap-3"
      >
        <h2 id="file-done-steps" className="px-1 font-bold text-lg">
          {t("done.change")}
        </h2>
        <StepList>{kit.steps.map((s) => stepRow(s, true))}</StepList>
      </section>
      <div className="xl:hidden">
        <div aria-hidden="true" className="h-28" />
        <FloatingDock>
          <DockButton
            icon={
              <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
            }
            onClick={main.go}
            loading={main.pending}
          >
            {main.label}
          </DockButton>
        </FloatingDock>
      </div>
    </div>
  );
}

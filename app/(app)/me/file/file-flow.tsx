"use client";

import {
  FILE_STEPS,
  type FileStep,
  fileStepStates,
  isNewFile,
  pensionDue,
  resumeStep,
  type StepState,
  stepsDone,
} from "@domain/employee-file-steps";
import { formArg } from "@domain/profile";
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
import { type ReactNode, useEffect, useRef, useState } from "react";
import { failureKey } from "./failure-words";
import type {
  FileActionFailure,
  FileActions,
  FileScreenData,
} from "./file-types";
import { type Kit, useDay, WhyButton } from "./flow-kit";
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
 * is an address (`?step=`), so "back" and a link from the profile work.
 * Also drawn by the twin on /design/shell/me/file.
 */
export function FileFlow({
  data,
  view,
  actions,
  base,
  profileHref,
  keep = "",
  preset,
}: {
  data: FileScreenData;
  view: FileView;
  actions: FileActions;
  /** "" in the app, "/design/shell" on the twin. */
  base: string;
  profileHref: string;
  /** The twin's own query (its state and language), kept from step to step. */
  keep?: string;
  /** The twin's: a state to open the bank step on. */
  preset?: { bank?: BankPreset };
}) {
  const t = useTranslations("app.file");
  const router = useRouter();
  const day = useDay();
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

  const stepHref = (next: FileStep | "done") =>
    `${base}/me/file?step=${next}${keep ? `&${keep}` : ""}`;
  const go = (next: FileStep | "done") =>
    router.push(stepHref(next), { scroll: false });

  // A step opened by its address, or picked up where the person stopped: a
  // phone and a tablet start at its top, a desktop scrolls to it among the
  // others (the first step is the page's top already).
  const first = useRef(true);
  useEffect(() => {
    const opening = first.current;
    first.current = false;
    if (current === "welcome" || current === "done") {
      if (!opening) window.scrollTo({ top: 0 });
      return;
    }
    if (desktop()) {
      if (opening && current === "start") return;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      document.getElementById(`file-${current}`)?.scrollIntoView({
        block: "start",
        behavior: reduce ? "auto" : "smooth",
      });
    } else if (!opening) {
      window.scrollTo({ top: 0 });
    }
  }, [current]);

  const kit: Kit = {
    data,
    states,
    actions,
    t,
    go,
    profileHref,
    say: (message) => setToast({ message, stamp: Date.now().toString() }),
    openNotice: () => setNotice(true),
    form: formArg(data.addressForm),
  };

  async function switchLanguage() {
    if (switching) return;
    setSwitching(true);
    const result = await actions
      .saveProfile({ locale: data.locale === "en" ? "he" : "en" })
      .catch(() => ({ ok: false }) as const);
    setSwitching(false);
    if (!result.ok) kit.say(t("language.failed"));
  }

  async function send() {
    if (sending) return;
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
  const stepRow = (s: FileStep, link: boolean) => (
    <StepRow
      key={s}
      mark={MARK[states[s]]}
      title={t(`steps.name.${s}`)}
      state={t(`steps.state.${states[s]}`)}
      detail={states[s] === "direct" ? t("steps.state.direct") : undefined}
      href={link ? stepHref(s) : undefined}
      current={link && current === s}
    />
  );

  const hero = (
    <Card tone="hero" padding="none" className="relative mb-10 px-5 pt-6 pb-14">
      <p className="text-balance font-bold text-accent-ink text-xl">
        {t("welcome.title", { business })}
      </p>
      <Card
        tone="float"
        padding="lg"
        className="absolute inset-x-4 -bottom-10 flex flex-col gap-1"
      >
        <CardText className="text-ink">
          {t("welcome.body", { count: FILE_STEPS.length })}
        </CardText>
      </Card>
    </Card>
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
        />
      </div>

      {current === "done" ? (
        <DoneView kit={kit} stepRow={stepRow} />
      ) : (
        <>
          {current === "welcome" ? (
            <div className="flex flex-col gap-4">
              {hero}
              <WhyButton kit={kit} label={t("notice.title")} />
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
            <aside
              aria-label={t("steps.title")}
              className="hidden min-w-0 flex-col gap-4 md:sticky md:top-8 md:flex xl:order-last"
            >
              <StepList>{FILE_STEPS.map((s) => stepRow(s, true))}</StepList>
              <div className="hidden flex-col gap-3 xl:flex">
                <Card padding="lg" className="flex flex-col gap-2">
                  <h2 className="font-semibold text-md">
                    {t("summary.title")}
                  </h2>
                  {missingSteps.length === 0 ? (
                    <p className="text-base text-ink-2">{t("summary.none")}</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-base">
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
                <Button size="lg" loading={sending} onClick={send}>
                  <Send aria-hidden="true" className="rtl:-scale-x-100" />
                  {t("actions.send", { business })}
                </Button>
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
              onClick={() => go("start")}
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
 * the person's to do (a pension fund to choose by its day), and every step,
 * to change any of them.
 */
function DoneView({
  kit,
  stepRow,
}: {
  kit: Kit;
  stepRow: (step: FileStep, link: boolean) => ReactNode;
}) {
  const { t, data, states } = kit;
  const day = useDay();
  const business = data.businessName;
  const due = pensionDue(data.pensionDueOn, data.today);
  const open = FILE_STEPS.filter((s) => states[s] === "open");
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-8">
      <Card padding="lg" className="flex flex-col gap-2">
        <h2 className="font-bold text-xl">{t("done.title")}</h2>
        <p className="text-md">
          {data.file?.submitted_at
            ? t("done.sent", { business })
            : t("done.body", { business })}
        </p>
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
        <Button asChild variant="secondary" className="mt-2 self-start">
          <Link href={kit.profileHref}>{t("done.profile")}</Link>
        </Button>
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
    </div>
  );
}

"use client";

import { Button } from "@ui/button";
import { Card, CardTitle } from "@ui/card";
import { CodeSlots, type CodeSlotsStatus } from "@ui/code-slots";
import { EmptyState } from "@ui/empty-state";
import { Lock, MessageSquareLock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FileOpenWatch } from "./file-open-watch";
import { type HolderWordsKey, holderWordsOf } from "./holder-failure-words";
import type {
  AcknowledgeAnswer,
  ConfirmFileCodeAnswer,
  HolderFileActions,
  SendFileCodeAnswer,
} from "./holder-file-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * The way into someone's hiring file for a holder (profile H6a): the duties
 * screen, confirmed once in today's wording ("אישור ושליחת קוד": the
 * confirmation, then a code by SMS), or, once confirmed, the locked file
 * ("שליחת קוד"); then the code's boxes, which send on the last digit, and
 * on a right code the server opens the files on this device and the
 * screen is drawn again, open. One main action at a time. Every refusal is
 * said in words, with the focus on it while no boxes are up. The twin,
 * which keeps nothing, goes to its open state instead (`openedHref`).
 */
export function FileGate({
  kind,
  actions,
  code,
  openedHref,
  onOpened,
  children,
}: {
  kind: "duties" | "locked";
  actions: Pick<HolderFileActions, "acknowledge" | "sendCode" | "confirmCode">;
  /** Opens on the code's boxes, a code sent to the number ending in `tail` (the twin). */
  code?: { tail: string };
  /** Where a right code leads on the twin; the app draws the page again. */
  openedHref?: string;
  /** The files opened on this device, before the page is drawn again. */
  onOpened?: () => void;
  /** The duties' lines, drawn on the server. */
  children?: ReactNode;
}) {
  const t = useTranslations("app.team.file");
  const router = useRouter();
  const [phase, setPhase] = useState<"start" | "code">(code ? "code" : "start");
  const [tail, setTail] = useState(code?.tail ?? "");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<CodeSlotsStatus>("idle");
  // The boxes send only when they fill up, so after a refusal that isn't
  // the digits' fault they start again, empty.
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState<HolderWordsKey | null>(null);
  const said = useRef<HTMLParagraphElement>(null);

  // A refusal said with no boxes up takes the focus, so it is heard.
  useEffect(() => {
    if (problem && phase === "start") said.current?.focus();
  }, [problem, phase]);

  const opened = () => {
    onOpened?.();
    if (openedHref) router.push(openedHref);
    else router.refresh();
  };

  /** A refusal in words; the duties first, or the files open, draw the page again. */
  function say(failure: string, when: "send" | "confirm" | "other") {
    const key = holderWordsOf(failure, when);
    if (key === null) router.refresh();
    setProblem(key);
  }

  async function send() {
    setPending(true);
    setProblem(null);
    const answer = await actions
      .sendCode()
      .catch((): SendFileCodeAnswer => ({ ok: false, failure: "failed" }));
    setPending(false);
    if (!answer.ok) {
      say(answer.failure, "send");
      return;
    }
    setTail(answer.tail);
    setStatus("idle");
    setAttempt((n) => n + 1);
    setPhase("code");
  }

  async function confirmDuties() {
    setPending(true);
    setProblem(null);
    const answer = await actions
      .acknowledge()
      .catch((): AcknowledgeAnswer => ({ ok: false, failure: "failed" }));
    if (!answer.ok) {
      setPending(false);
      say(answer.failure, "other");
      return;
    }
    // Open on this device already, within its 15 minutes: no code needed.
    if (answer.open) {
      opened();
      return;
    }
    await send();
  }

  async function confirm(typed: string) {
    setStatus("pending");
    setProblem(null);
    const answer = await actions
      .confirmCode(typed)
      .catch((): ConfirmFileCodeAnswer => ({ ok: false, failure: "failed" }));
    if (answer.ok) {
      setStatus("success");
      opened();
      return;
    }
    say(answer.failure, "confirm");
    if (answer.failure === "wrongCode") {
      setStatus("error");
      return;
    }
    setStatus("idle");
    setAttempt((n) => n + 1);
  }

  const problemLine = problem ? (
    <p
      ref={said}
      tabIndex={-1}
      role="alert"
      className="font-medium text-danger outline-none"
    >
      {t(problem)}
    </p>
  ) : null;

  if (phase === "code") {
    return (
      <Card padding="lg" className="flex flex-col gap-4">
        {/* From the duties too: the file stays locked until the code is in. */}
        <CardTitle as="h2">{t("locked.title")}</CardTitle>
        <p className="text-ink-2">{t.rich("code.sent", { tail, ltr })}</p>
        <CodeSlots
          key={attempt}
          name="code"
          label={t("code.label")}
          status={status}
          onComplete={confirm}
          autoFocus
          autoComplete="one-time-code"
        />
        {problemLine}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            loading={pending}
            disabled={status === "pending" || status === "success"}
            onClick={() => send()}
            className="text-ink-2"
          >
            {t("code.resend")}
          </Button>
        </div>
      </Card>
    );
  }

  if (kind === "duties") {
    return (
      <Card padding="lg" className="flex flex-col gap-4">
        <CardTitle as="h2">{t("duties.title")}</CardTitle>
        {children}
        {problemLine}
        <Button
          size="lg"
          loading={pending}
          onClick={() => confirmDuties()}
          className="w-full md:w-auto md:self-start"
        >
          <MessageSquareLock aria-hidden="true" />
          {t("duties.confirm")}
        </Button>
      </Card>
    );
  }

  return (
    <EmptyState
      icon={<Lock />}
      headingLevel="h2"
      title={t("locked.title")}
      body={t("locked.body")}
    >
      {problemLine}
      <Button size="lg" loading={pending} onClick={() => send()}>
        <MessageSquareLock aria-hidden="true" />
        {t("locked.send")}
      </Button>
    </EmptyState>
  );
}

/**
 * The file's place on its screen, as the server drew it: the gate (the
 * duties, or locked) or the file itself, watched (`FileOpenWatch`). A file
 * that closes here (15 minutes idle, no answer from the server, "נעילת
 * התיק") shows the locked card at once, without waiting for the server or
 * its network; the server's next drawing, locked, lands on the same card in
 * the same place, so a code already asked for there stays asked for. A
 * right code there opens the file again.
 */
export function GatedFile({
  kind,
  actions,
  code,
  twin,
  duties,
  children,
}: {
  kind: "duties" | "locked" | "open";
  actions: HolderFileActions;
  code?: { tail: string };
  /** The twin's states for what the app does by drawing itself again. */
  twin?: { opened: string; locked: string };
  /** The duties' lines, drawn on the server. */
  duties?: ReactNode;
  /** The file, while it is open. */
  children?: ReactNode;
}) {
  const [closedHere, setClosedHere] = useState(false);
  if (kind === "open" && !closedHere) {
    return (
      <FileOpenWatch
        actions={actions}
        lockedHref={twin?.locked}
        onClosed={() => setClosedHere(true)}
      >
        {children}
      </FileOpenWatch>
    );
  }
  const gate = kind === "duties" ? "duties" : "locked";
  return (
    <div
      data-file-gate={gate}
      className="flex w-full flex-col md:mx-auto md:max-w-xl"
    >
      <FileGate
        kind={gate}
        actions={actions}
        code={code}
        openedHref={twin?.opened}
        onOpened={() => setClosedHere(false)}
      >
        {gate === "duties" ? duties : null}
      </FileGate>
    </div>
  );
}

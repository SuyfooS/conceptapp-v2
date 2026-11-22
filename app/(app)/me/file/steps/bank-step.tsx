"use client";

import { accountHint, checkBankAccount } from "@domain/bank-account";
import { banksOn, formatBankCode } from "@domain/banks";
import {
  BANK_INSTRUCTION_VERSION,
  FILE_TEXT_MAX,
  maskedHint,
} from "@domain/employee-file";
import { clockAt } from "@domain/today";
import { tidyLine } from "@domain/typed-text";
import { BankField, type BankFieldValue, EMPTY_BANK } from "@ui/bank-field";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { CodeSlots, type CodeSlotsStatus } from "@ui/code-slots";
import { MaskedValue } from "@ui/masked-value";
import { TextField } from "@ui/text-field";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type CodeKey, codeKey, failureKey } from "../failure-words";
import type {
  CodeFailure,
  ConfirmBankAnswer,
  FileActionFailure,
  FileScreenData,
  SendCodeAnswer,
} from "../file-types";
import {
  Failure,
  FileSection,
  focusFirstField,
  focusTitle,
  formArgs,
  formIdOf,
  type Kit,
  LaterLink,
  ltr,
  Reason,
  StepDock,
  showFirstProblem,
  stepPending,
  useDay,
} from "../flow-kit";
import { bankBlock } from "../flow-rules";

type Holder = "self" | "family" | "other";

/** The account typed, its code asked for, or the one saved shown. */
export type BankPhase = "edit" | "code" | "saved";

/** What the twin opens the step on: an account typed, its code asked for, or held. */
export type BankPreset = {
  value: BankFieldValue;
  holder: Holder;
  instruction: boolean;
  phase: "edit" | "code";
  tail?: string;
  /** The week after a phone change: the day a change opens again. */
  heldUntil?: string;
};

/**
 * The week after a phone change, as the server said it: the day a change
 * opens again, and the moment it does when that was asked before a code
 * went (`checkBankChange`); a refusal after the code says the day only.
 */
export type BankHold = { day: string; at: string | null };

/** The account as typed, before its code: what the code's phase sends. */
export type BankTyped = {
  value: BankFieldValue;
  holder: Holder | null;
  holderName: string;
  instruction: boolean;
};

/** Nothing typed yet, or what was typed gone with its save. */
export const NOTHING_TYPED: BankTyped = {
  value: EMPTY_BANK,
  holder: null,
  holderName: "",
  instruction: false,
};

/** An account by its bank, branch and last digits. */
type ShownAccount = { bank: number; branch: number; masked: string };

/**
 * Where the account stands on screen, with everything its phase shows:
 * what is typed, the number the code went to, the week after a phone
 * change, and the account just confirmed with what the business will check.
 * The flow keeps it (`useBankScreen`), since the step is drawn only while
 * it can be seen (never under the done screen): a phase kept apart from
 * what it shows outlived it there (the code's boxes over no account). And a
 * desktop's summary offers what the step's own action does now.
 */
export type BankScreenState = {
  phase: BankPhase;
  typed: BankTyped;
  /** The last digits of the number the code goes to. */
  tail: string | null;
  hold: BankHold | null;
  /** The account just confirmed, shown until the server's answer has it. */
  confirmed: ShownAccount | null;
  review: "new" | "warned" | null;
};

export type BankScreen = BankScreenState & {
  /** Changes what is given at once: a phase together with what it shows. */
  set: (
    change:
      | Partial<BankScreenState>
      | ((was: BankScreenState) => Partial<BankScreenState>),
  ) => void;
};

/** Where the account starts: saved when the file holds one, or as the twin opens it. */
export function useBankScreen(
  data: FileScreenData,
  preset?: BankPreset,
): BankScreen {
  const [state, setState] = useState<BankScreenState>(() => ({
    phase: preset?.phase ?? (data.file?.has.bank_account ? "saved" : "edit"),
    typed: preset
      ? {
          value: preset.value,
          holder: preset.holder,
          holderName: "",
          instruction: preset.instruction,
        }
      : NOTHING_TYPED,
    tail: preset?.tail ?? data.phoneTail,
    hold: preset?.heldUntil ? { day: preset.heldUntil, at: null } : null,
    confirmed: null,
    review: null,
  }));
  const set = useCallback<BankScreen["set"]>(
    (change) =>
      setState((was) => ({
        ...was,
        ...(typeof change === "function" ? change(was) : change),
      })),
    [],
  );
  return { ...state, set };
}

/** The account as the server takes it, from what is typed. */
export const bankToSend = ({ value, holder, holderName }: BankTyped) => ({
  bank: value.bank,
  branch: Number(value.branch),
  account: value.account,
  holder,
  ...(holder === "family" ? { holderName } : {}),
  instruction: BANK_INSTRUCTION_VERSION,
});

/**
 * Whether a change waits: until the moment it opens when that is known (the
 * step lets go then), and through the day it opens when only the day is, so
 * the code's action never comes back while the server would still refuse.
 */
export const bankHeld = (hold: BankHold | null, today: string) =>
  hold !== null && hold.day >= today;

/**
 * The week after a phone change in words while it holds, or null: by its
 * time when it opens later today, so "today" never reads as now.
 */
export function useHoldWords(kit: Kit, hold: BankHold | null): ReactNode {
  const day = useDay();
  const { t, data } = kit;
  if (hold === null || !bankHeld(hold, data.today)) return null;
  return hold.at !== null && hold.day === data.today
    ? t.rich("bank.phoneHoldToday", {
        time: clockAt(new Date(hold.at), data.timeZone).time,
        ltr,
      })
    : t("bank.phoneHold", { date: day(hold.day) });
}

type Problem =
  | { of: "code"; key: CodeKey }
  | { of: "file"; failure: FileActionFailure; opensOn?: string };

/**
 * Step 3, "לאן להעביר את השכר": the account pasted or typed, checked by
 * Masav's rules as it is typed and said in words, with "המספר נכון, לשמור"
 * to keep a number the check doubts (it is then flagged for a holder);
 * whose account it is (the person's or a close relative's: the law allows
 * no one else); the written instruction, in the chosen form; and a code by
 * SMS to the number the person signs in with, which the database asks for
 * before any bank change. The account is tried whole before the code goes,
 * so the week after a phone change says its day before any SMS, and keeps
 * the code from going until then. What keeps the account back is said
 * above its action, and a press that can't go takes the person to the
 * first field it is about. Saved, the account shows by its bank, branch and
 * last digits; "החלפת החשבון" starts again, and "השארת החשבון הנוכחי" goes
 * back to the one saved. While the code's boxes are up, the form's press
 * (Enter in them) goes to them, and a desktop's summary offers none, as the
 * dock doesn't: only "שליחת קוד חדש" sends another code. What it stands on
 * is the flow's (`useBankScreen`), so the step left for the done screen and
 * opened again shows the code's boxes over the account they confirm.
 */
export function BankStep({
  kit,
  active,
  screen,
}: {
  kit: Kit;
  active: boolean;
  /** Where it stands, kept by the flow (`useBankScreen`). */
  screen: BankScreen;
}) {
  const { t, data } = kit;
  const tb = useTranslations("banks");
  const day = useDay();
  const formId = formIdOf("bank");
  const holderNameId = useId();
  const form = useRef<HTMLFormElement>(null);
  const file = data.file;
  const { phase, typed: entered, tail, hold, confirmed, review, set } = screen;
  const { value, holder, holderName, instruction } = entered;
  const type = (change: Partial<BankTyped>) =>
    set((was) => ({ typed: { ...was.typed, ...change } }));
  const [tried, setTried] = useState(false);
  const [sending, setSending] = stepPending(kit, "bank");
  const [status, setStatus] = useState<CodeSlotsStatus>("idle");
  // The slots send only when they fill up, so after a refusal that isn't the
  // digits' fault they start again, empty.
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(null);

  const bankName = (code: number) => {
    const key = String(code) as Parameters<typeof tb>[0];
    return tb.has(key) ? tb(key) : formatBankCode(code);
  };
  const banks = banksOn(data.today).map((bank) => ({
    code: bank.code,
    name: bankName(bank.code),
  }));

  const typed =
    value.bank !== null && value.branch !== "" && value.account !== "";
  const check = typed
    ? checkBankAccount(
        {
          bank: value.bank ?? 0,
          branch: Number(value.branch),
          account: value.account,
        },
        data.today,
      )
    : null;
  const warning =
    check?.status === "warning" ? t(`bank.warning.${check.warning}`) : null;
  const unusable = check?.status === "unusable";
  const holderNameShort =
    holder === "family" && tidyLine(holderName).length < 2;
  const holderNameError =
    holder === "family" &&
    tidyLine(holderName).length > FILE_TEXT_MAX.holderName
      ? t.rich("tooLong", { max: FILE_TEXT_MAX.holderName, ltr })
      : null;
  const empty = [
    value.bank === null,
    value.branch === "",
    value.account === "",
    holder === null,
    holderNameShort,
    !instruction,
  ].filter(Boolean).length;
  const block = bankBlock({
    empty,
    holderOther: holder === "other",
    unusable,
    warning: warning !== null,
    kept: value.kept,
  });
  // The week after a phone change: no code goes until it opens, and a week
  // known to the moment lets go then, its words with it.
  const held = bankHeld(hold, data.today);
  const holdAt = hold?.at ?? null;
  useEffect(() => {
    if (holdAt === null) return;
    const timer = window.setTimeout(
      () => {
        set({ hold: null });
        setProblem((was) =>
          was?.of === "file" && was.failure === "phoneHold" ? null : was,
        );
      },
      Math.max(0, Date.parse(holdAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [holdAt, set]);
  const ready = block === null && !holderNameError && !held;
  // What keeps the account back, said above its action before it is pressed.
  const blockWords =
    block === "missing"
      ? t("missingRequired", { count: empty })
      : block === "other"
        ? t("bank.otherBlocked")
        : block === "unusable"
          ? t("bank.accountInvalid")
          : block === "warning"
            ? t("bank.checkFirst", { keep: t("bank.keep") })
            : null;
  const holdWords = useHoldWords(kit, hold);

  function said(
    failure: CodeFailure | FileActionFailure,
    when: "send" | "confirm",
    opens: { opensOn?: string; opensAt?: string },
  ) {
    const key = codeKey(failure, when);
    setProblem(
      key
        ? { of: "code", key }
        : {
            of: "file",
            failure: failure as FileActionFailure,
            opensOn: opens.opensOn,
          },
    );
    if (failure === "phoneHold") {
      // No code goes until it opens: back to the account, held.
      set({
        hold: { day: opens.opensOn ?? data.today, at: opens.opensAt ?? null },
        phase: "edit",
      });
      setStatus("idle");
      focusTitle("bank");
    }
  }

  async function askForCode(event?: FormEvent) {
    event?.preventDefault();
    // The code's boxes are the form's only field while they are up.
    if (event && phase === "code") {
      focusFirstField(form);
      return;
    }
    setTried(true);
    if (sending) return;
    if (!ready) {
      if (form.current) showFirstProblem(form.current);
      return;
    }
    setSending(true);
    setProblem(null);
    const answer = await kit.actions
      .sendBankCode({ bank: bankToSend(entered) })
      .catch((): SendCodeAnswer => ({ ok: false, failure: "failed" }));
    setSending(false);
    if (!answer.ok) {
      said(answer.failure, "send", answer);
      return;
    }
    setStatus("idle");
    setAttempt((n) => n + 1);
    set({ tail: answer.tail, phase: "code" });
  }

  async function confirm(code: string) {
    setStatus("pending");
    setProblem(null);
    const answer = await kit.actions
      .confirmBank({ code, bank: bankToSend(entered) })
      .catch((): ConfirmBankAnswer => ({ ok: false, failure: "failed" }));
    if (answer.ok) {
      setStatus("success");
      setTried(false);
      // Everything typed goes with its save; the account shows saved.
      set({
        review: answer.review,
        ...(check && check.status !== "unusable"
          ? {
              confirmed: {
                bank: check.account.bank,
                branch: check.account.branch,
                masked: maskedHint(accountHint(check.account.account)),
              },
            }
          : {}),
        typed: NOTHING_TYPED,
        phase: "saved",
      });
      kit.say(t("saved"));
      // The code's boxes went: the step, saved, takes the focus.
      focusTitle("bank");
      return;
    }
    said(answer.failure, "confirm", answer);
    if (answer.failure === "phoneHold") return;
    if (answer.failure === "wrongCode") {
      setStatus("error");
      return;
    }
    setStatus("idle");
    setAttempt((n) => n + 1);
  }

  const problemWords =
    problem === null
      ? null
      : problem.of === "code"
        ? t(`bank.code.${problem.key}`, { business: data.businessName })
        : problem.failure === "phoneHold" && problem.opensOn
          ? t("bank.phoneHold", { date: day(problem.opensOn) })
          : t(`failures.${failureKey(problem.failure)}`);

  const savedReview = review ?? file?.bank_review ?? null;
  const shown =
    confirmed ??
    (file?.bank_code != null && file.bank_branch != null
      ? {
          bank: file.bank_code,
          branch: file.bank_branch,
          masked: data.masked.bankAccount,
        }
      : null);
  // An account is saved already: "השארת החשבון הנוכחי" goes back to it.
  const hasSaved = Boolean(file?.has.bank_account) || confirmed !== null;
  const editing = phase === "edit";

  const keepSaved = hasSaved ? (
    <Button
      variant="ghost"
      disabled={status === "pending"}
      onClick={() => {
        // Everything typed goes, and with it what was said about it.
        set({ typed: NOTHING_TYPED, phase: "saved" });
        setTried(false);
        setProblem(null);
        setStatus("idle");
        focusTitle("bank");
      }}
      className="self-start text-ink-2"
    >
      {t("bank.keepCurrent")}
    </Button>
  ) : null;

  return (
    <FileSection step="bank" active={active} kit={kit}>
      {phase === "saved" ? (
        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-ink-2 text-sm">{t("bank.current")}</p>
            {shown ? (
              <p className="font-medium text-md">
                {t.rich("bank.currentLine", {
                  bank: bankName(shown.bank),
                  branch: String(shown.branch).padStart(3, "0"),
                  ltr,
                })}
              </p>
            ) : null}
          </div>
          {shown?.masked ? (
            <MaskedValue
              label={t("bank.account")}
              masked={shown.masked}
              onReveal={async () => {
                const answer = await kit.actions.reveal("bank_account");
                return answer.ok ? answer.value : null;
              }}
              showLabel={t("masked.show")}
              hideLabel={t("masked.hide")}
              hiddenLabel={t("masked.hidden", { what: t("bank.account") })}
              failedLabel={t("masked.failed")}
            />
          ) : null}
          {file?.bank_holder_kind === "family" && data.holderName ? (
            <p className="text-base">
              {t("bank.holderLine", { name: data.holderName })}
            </p>
          ) : null}
          {savedReview === "new" || savedReview === "warned" ? (
            <p role="status" className="text-base">
              {t(savedReview === "warned" ? "bank.savedWarned" : "bank.saved", {
                business: data.businessName,
              })}
            </p>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              set({ phase: "edit", review: null, confirmed: null });
              setProblem(null);
              // The button goes: the first field of the new account takes
              // the focus.
              focusFirstField(form);
            }}
            className="self-start"
          >
            {t("bank.change")}
          </Button>
        </Card>
      ) : (
        <form
          ref={form}
          id={formId}
          onSubmit={askForCode}
          noValidate
          className="flex flex-col gap-5"
        >
          <Card padding="lg" className="flex flex-col gap-4">
            {editing ? (
              <BankField
                labels={{
                  paste: t("bank.paste"),
                  pasteHint: t.rich("bank.pasteHint", { ltr }),
                  pasteNone: t("bank.pasteNone"),
                  bank: t("bank.bank"),
                  choose: t("bank.choose"),
                  branch: t("bank.branch"),
                  account: t("bank.account"),
                  where: t("bank.where"),
                  keep: t("bank.keep"),
                  kept: t("bank.kept", { business: data.businessName }),
                }}
                banks={banks}
                value={value}
                onChange={(next) => type({ value: next })}
                warning={warning}
                error={unusable ? t("bank.accountInvalid") : null}
                marked={tried}
              />
            ) : (
              <p className="font-medium text-md">
                {value.bank !== null
                  ? t.rich("bank.currentLine", {
                      bank: bankName(value.bank),
                      branch: value.branch.padStart(3, "0"),
                      ltr,
                    })
                  : null}
              </p>
            )}
            <Reason>{t("bank.reason")}</Reason>
          </Card>

          {editing ? (
            <>
              <ChoiceList legend={t("bank.holder")} legendClassName="text-md">
                {(["self", "family", "other"] as const).map((option, at) => (
                  <ChoiceRow
                    key={option}
                    name={`${formId}-holder`}
                    title={t(`bank.${option}`)}
                    checked={holder === option}
                    onChange={() => type({ holder: option })}
                    // A press with nobody chosen comes here.
                    aria-invalid={
                      tried && holder === null && at === 0 ? true : undefined
                    }
                  />
                ))}
              </ChoiceList>
              {holder === "family" ? (
                <Card padding="lg">
                  <TextField
                    id={holderNameId}
                    label={t("bank.holderName")}
                    value={holderName}
                    onChange={(event) =>
                      type({ holderName: event.target.value })
                    }
                    error={holderNameError}
                    {...(tried && holderNameShort
                      ? { "aria-invalid": true }
                      : {})}
                    autoComplete="off"
                  />
                </Card>
              ) : null}
              {holder === "other" ? (
                <p role="status" className="px-1 text-base">
                  {t("bank.otherNote", { business: data.businessName })}
                </p>
              ) : null}
              <label className="flex min-h-11 cursor-pointer items-start gap-3 px-1">
                <input
                  type="checkbox"
                  checked={instruction}
                  onChange={(event) =>
                    type({ instruction: event.target.checked })
                  }
                  aria-invalid={tried && !instruction ? true : undefined}
                  className="mt-0.5 size-6 shrink-0 cursor-pointer accent-accent"
                />
                <span className="text-base">
                  {t("bank.instruction", formArgs(kit))}
                </span>
              </label>
              {/* On a desktop, what keeps the account back is said beside
                  its action, as the dock says it above its own. */}
              {(tried || block === "warning" || held) &&
              (holdWords ?? blockWords) ? (
                <p role="status" className="hidden px-1 text-base xl:block">
                  {holdWords ?? blockWords}
                </p>
              ) : null}
              <div className="hidden xl:flex">
                <Button
                  type="submit"
                  variant="secondary"
                  loading={sending}
                  disabled={held}
                >
                  {t("bank.confirm")}
                </Button>
              </div>
            </>
          ) : (
            <Card padding="lg" className="flex flex-col gap-3">
              {tail ? (
                <p className="text-base">
                  {t.rich("bank.code.sent", { tail, ltr })}
                </p>
              ) : null}
              <CodeSlots
                key={attempt}
                name="code"
                label={t("bank.code.label")}
                status={status}
                onComplete={confirm}
                autoFocus
                autoComplete="one-time-code"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  loading={sending}
                  disabled={status === "pending" || status === "success"}
                  onClick={() => askForCode()}
                  className="text-ink-2"
                >
                  {t("bank.code.resend")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={status === "pending" || status === "success"}
                  onClick={() => {
                    set({ phase: "edit" });
                    setProblem(null);
                    // The code's boxes go: the account's first field
                    // takes the focus.
                    focusFirstField(form);
                  }}
                  className="text-ink-2"
                >
                  {t("bank.code.edit")}
                </Button>
              </div>
            </Card>
          )}
          {/* In the week after a phone change the dock says it, and a
              desktop beside the action; elsewhere, the refusal here. */}
          <Failure>{held ? null : problemWords}</Failure>
          {keepSaved}
        </form>
      )}
      <LaterLink kit={kit} />
      {active ? (
        <StepDock
          kit={kit}
          step="bank"
          main={
            phase === "saved"
              ? {
                  label: t("actions.continue"),
                  onClick: () => kit.go(kit.next("bank")),
                }
              : editing
                ? {
                    label: t("bank.confirm"),
                    form: formId,
                    // Something missing, or the week after a phone change,
                    // is said above it; anything else, once pressed.
                    disabled: block === "missing" || block === "other" || held,
                    pending: sending,
                  }
                : undefined
          }
          notice={editing ? (holdWords ?? blockWords) : null}
        />
      ) : null}
    </FileSection>
  );
}

"use client";

import { accountHint, checkBankAccount } from "@domain/bank-account";
import { banksOn, formatBankCode } from "@domain/banks";
import { BANK_INSTRUCTION_VERSION, maskedHint } from "@domain/employee-file";
import { nextFileStep } from "@domain/employee-file-steps";
import { tidyLine } from "@domain/typed-text";
import { BankField, type BankFieldValue, EMPTY_BANK } from "@ui/bank-field";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { CodeSlots, type CodeSlotsStatus } from "@ui/code-slots";
import { MaskedValue } from "@ui/masked-value";
import { TextField } from "@ui/text-field";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { type CodeKey, codeKey, failureKey } from "../failure-words";
import type { CodeFailure, FileActionFailure } from "../file-types";
import {
  Failure,
  FileSection,
  formArgs,
  type Kit,
  LaterLink,
  ltr,
  Reason,
  StepDock,
  useDay,
} from "../flow-kit";

type Holder = "self" | "family" | "other";

/** What the twin opens the step on: an account typed, and the code asked for. */
export type BankPreset = {
  value: BankFieldValue;
  holder: Holder;
  instruction: boolean;
  phase: "edit" | "code";
  tail?: string;
};

type Problem =
  | { of: "code"; key: CodeKey }
  | { of: "file"; failure: FileActionFailure; opensOn?: string };

/**
 * Step 3, "לאן להעביר את השכר": the account pasted or typed, checked by
 * Masav's rules as it is typed and said in words, with "המספר נכון, לשמור"
 * to keep a number the check doubts (it is then flagged for a holder);
 * whose account it is (the person's or a close relative's: the law allows
 * no one else); the written instruction, in the chosen form; and a code by
 * SMS to the person's own number, which the database asks for before any
 * bank change. Saved, the account shows by its bank, branch and last
 * digits, and "החלפת החשבון" starts again.
 */
export function BankStep({
  kit,
  active,
  preset,
}: {
  kit: Kit;
  active: boolean;
  preset?: BankPreset;
}) {
  const { t, data } = kit;
  const tb = useTranslations("banks");
  const day = useDay();
  const formId = useId();
  const holderNameId = useId();
  const file = data.file;
  const [phase, setPhase] = useState<"edit" | "code" | "saved">(
    preset?.phase ?? (file?.has.bank_account ? "saved" : "edit"),
  );
  const [value, setValue] = useState<BankFieldValue>(
    preset?.value ?? EMPTY_BANK,
  );
  const [holder, setHolder] = useState<Holder | null>(preset?.holder ?? null);
  const [holderName, setHolderName] = useState("");
  const [instruction, setInstruction] = useState(preset?.instruction ?? false);
  const [tail, setTail] = useState<string | null>(
    preset?.tail ?? data.phoneTail,
  );
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<CodeSlotsStatus>("idle");
  // The slots send only when they fill up, so after a refusal that isn't the
  // digits' fault they start again, empty.
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [review, setReview] = useState<"new" | "warned" | null>(null);
  // The account just confirmed, shown until the server's answer has it.
  const [confirmed, setConfirmed] = useState<{
    bank: number;
    branch: number;
    masked: string;
  } | null>(null);

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
  const empty = [
    value.bank === null,
    value.branch === "",
    value.account === "",
    holder === null,
    holder === "family" && tidyLine(holderName).length < 2,
    !instruction,
  ].filter(Boolean).length;
  const ready =
    empty === 0 &&
    holder !== "other" &&
    !unusable &&
    (warning === null || value.kept);

  function said(
    failure: CodeFailure | FileActionFailure,
    when: "send" | "confirm",
    opensOn?: string,
  ) {
    const key = codeKey(failure, when);
    setProblem(
      key
        ? { of: "code", key }
        : { of: "file", failure: failure as FileActionFailure, opensOn },
    );
  }

  async function askForCode(event?: FormEvent) {
    event?.preventDefault();
    if (!ready || sending) return;
    setSending(true);
    setProblem(null);
    const answer = await kit.actions
      .sendBankCode()
      .catch(() => ({ ok: false, failure: "failed" }) as const);
    setSending(false);
    if (!answer.ok) {
      said(answer.failure, "send");
      return;
    }
    setTail(answer.tail);
    setStatus("idle");
    setAttempt((n) => n + 1);
    setPhase("code");
  }

  async function confirm(code: string) {
    setStatus("pending");
    setProblem(null);
    const answer = await kit.actions
      .confirmBank({
        code,
        bank: {
          bank: value.bank,
          branch: Number(value.branch),
          account: value.account,
          holder,
          ...(holder === "family" ? { holderName } : {}),
          instruction: BANK_INSTRUCTION_VERSION,
        },
      })
      .catch(() => ({ ok: false, failure: "failed" }) as const);
    if (answer.ok) {
      setStatus("success");
      setReview(answer.review);
      if (check && check.status !== "unusable") {
        setConfirmed({
          bank: check.account.bank,
          branch: check.account.branch,
          masked: maskedHint(accountHint(check.account.account)),
        });
      }
      setValue(EMPTY_BANK);
      setHolder(null);
      setHolderName("");
      setInstruction(false);
      setPhase("saved");
      kit.say(t("saved"));
      return;
    }
    said(
      answer.failure,
      "confirm",
      "opensOn" in answer ? answer.opensOn : undefined,
    );
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
  const editing = phase === "edit";

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
              setPhase("edit");
              setReview(null);
              setConfirmed(null);
              setProblem(null);
            }}
            className="self-start"
          >
            {t("bank.change")}
          </Button>
        </Card>
      ) : (
        <form
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
                onChange={setValue}
                warning={warning}
                error={unusable ? t("bank.accountInvalid") : null}
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
                {(["self", "family", "other"] as const).map((option) => (
                  <ChoiceRow
                    key={option}
                    name={`${formId}-holder`}
                    title={t(`bank.${option}`)}
                    checked={holder === option}
                    onChange={() => setHolder(option)}
                  />
                ))}
              </ChoiceList>
              {holder === "family" ? (
                <Card padding="lg">
                  <TextField
                    id={holderNameId}
                    label={t("bank.holderName")}
                    value={holderName}
                    onChange={(event) => setHolderName(event.target.value)}
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
                  onChange={(event) => setInstruction(event.target.checked)}
                  className="mt-0.5 size-6 shrink-0 cursor-pointer accent-accent"
                />
                <span className="text-base">
                  {t("bank.instruction", formArgs(kit))}
                </span>
              </label>
              <div className="hidden xl:flex">
                <Button
                  type="submit"
                  variant="secondary"
                  loading={sending}
                  disabled={!ready}
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
                    setPhase("edit");
                    setProblem(null);
                  }}
                  className="text-ink-2"
                >
                  {t("bank.code.edit")}
                </Button>
              </div>
            </Card>
          )}
          <Failure>{problemWords}</Failure>
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
                  onClick: () => kit.go(nextFileStep("bank") ?? "done"),
                }
              : editing
                ? {
                    label: t("bank.confirm"),
                    form: formId,
                    disabled: !ready,
                    pending: sending,
                  }
                : undefined
          }
          notice={
            editing && holder !== "other" && empty > 0
              ? t("missingRequired", { count: empty })
              : null
          }
        />
      ) : null}
    </FileSection>
  );
}

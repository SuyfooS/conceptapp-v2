"use client";

import type { PensionAnswer } from "@domain/employee-file";
import { nextFileStep, pensionDue } from "@domain/employee-file-steps";
import {
  isPensionFund,
  PENSION_FUNDS,
  type PensionFundKey,
  UNKNOWN_FUND,
} from "@domain/pension-funds";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceMenu, choiceShown } from "@ui/choice-menu";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { fieldInputClass } from "@ui/text-field";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { failureKey } from "../failure-words";
import type { FileActionFailure } from "../file-types";
import {
  Failure,
  FileSection,
  formIdOf,
  type Kit,
  LaterLink,
  Reason,
  StepDock,
  showFirstProblem,
  stepPending,
  useDay,
} from "../flow-kit";

/** The three answers the screen asks; "later" is a choice inside "new". */
type Asked = "existing" | "new" | "employer";

/** "אבחר אחר כך", among the funds of a new choice. */
const LATER = "later";

/**
 * Step 4, "פנסיה": a fund the person is in already (by name, or "אין לי את
 * השם עכשיו"), one they choose, or the business's choice; a new one may wait,
 * "אבחר אחר כך", until the day the law gives (60 days from the start of the
 * work), after which the business chooses and the screen says so. A press
 * with an answer or its fund still to choose marks it and goes to it.
 */
export function PensionStep({ kit, active }: { kit: Kit; active: boolean }) {
  const { t, data } = kit;
  const tf = useTranslations("pensionFunds");
  const day = useDay();
  const formId = formIdOf("pension");
  const stored = data.file?.pension_answer ?? null;
  const storedFund = data.file?.pension_fund ?? null;
  const [answer, setAnswer] = useState<Asked | null>(
    stored === "later" ? "new" : stored,
  );
  const [fund, setFund] = useState<string | null>(
    stored === "later" ? LATER : isPensionFund(storedFund) ? storedFund : null,
  );
  const [tried, setTried] = useState(false);
  const [pending, setPending] = stepPending(kit, "pension");
  const [failure, setFailure] = useState<FileActionFailure | null>(null);

  const due = pensionDue(data.pensionDueOn, data.today);
  const funds = PENSION_FUNDS.map((one) => ({
    key: one.key,
    label: tf(one.key),
  }));
  const options =
    answer === "existing"
      ? [...funds, { key: UNKNOWN_FUND, label: tf(UNKNOWN_FUND) }]
      : due.kind === "passed"
        ? funds
        : [...funds, { key: LATER, label: t("pension.later") }];
  const chosen = fund !== null && options.some((o) => o.key === fund);
  const needsFund = answer === "existing" || answer === "new";
  const empty = (answer === null ? 1 : 0) + (needsFund && !chosen ? 1 : 0);

  function pick(next: Asked) {
    setAnswer(next);
    // A fund chosen for one answer isn't the other's.
    if (next !== answer) setFund(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (pending) return;
    if (empty > 0 || answer === null) {
      showFirstProblem(event.currentTarget);
      return;
    }
    setPending(true);
    setFailure(null);
    const sent: { answer: PensionAnswer; fund?: PensionFundKey } =
      answer === "employer"
        ? { answer }
        : fund === LATER
          ? { answer: "later" }
          : { answer, ...(isPensionFund(fund) ? { fund } : {}) };
    const result = await kit.actions
      .saveStep("pension", { pension: sent })
      .catch(() => ({ ok: false, failure: "failed" }) as const);
    setPending(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setTried(false);
    kit.say(t("saved"));
    if (active) kit.go(nextFileStep("pension") ?? "done");
  }

  const dueWords =
    due.kind === "open"
      ? t("pension.dueOn", {
          date: day(due.dueOn),
          business: data.businessName,
        })
      : due.kind === "passed"
        ? t("pension.duePassed", { business: data.businessName })
        : t("pension.dueNone", { business: data.businessName });
  const shown = choiceShown(options, fund ?? "", t("pension.pick"));

  return (
    <FileSection step="pension" active={active} kit={kit}>
      <form
        id={formId}
        onSubmit={save}
        noValidate
        className="flex flex-col gap-5"
      >
        <ChoiceList legend={t("pension.question")} legendClassName="text-md">
          <ChoiceRow
            name={`${formId}-answer`}
            title={t("pension.yes")}
            checked={answer === "existing"}
            onChange={() => pick("existing")}
            // A press with no answer comes here.
            aria-invalid={tried && answer === null ? true : undefined}
          />
          <ChoiceRow
            name={`${formId}-answer`}
            title={t("pension.choose")}
            checked={answer === "new"}
            onChange={() => pick("new")}
          />
          <ChoiceRow
            name={`${formId}-answer`}
            title={t("pension.employer", { business: data.businessName })}
            checked={answer === "employer"}
            onChange={() => pick("employer")}
          />
        </ChoiceList>

        {needsFund ? (
          <Card padding="lg" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span aria-hidden="true" className="font-medium text-ink text-sm">
                {t("pension.which")}
              </span>
              <ChoiceMenu
                label={`${t("pension.which")} ${shown ?? ""}`}
                value={fund ?? ""}
                options={options}
                onChange={setFund}
                placeholder={t("pension.pick")}
                invalid={tried && !chosen}
                className={cn(
                  fieldInputClass,
                  "justify-between font-normal",
                  chosen ? "text-ink" : "text-ink-2",
                )}
              />
            </div>
            <Reason>
              {answer === "existing"
                ? t("pension.existingHelp", { business: data.businessName })
                : dueWords}
            </Reason>
          </Card>
        ) : null}

        <Reason>{t("pension.law")}</Reason>
        {due.kind === "passed" && !needsFund ? (
          <p role="status" className="px-1 font-medium text-base">
            {t("pension.duePassed", { business: data.businessName })}
          </p>
        ) : null}

        <Failure>
          {failure ? t(`failures.${failureKey(failure)}`) : null}
        </Failure>
        {tried && empty > 0 ? (
          <p role="status" className="hidden px-1 text-base xl:block">
            {t("missingRequired", { count: empty })}
          </p>
        ) : null}
        <div className="hidden xl:flex">
          <Button type="submit" variant="secondary" loading={pending}>
            {t("actions.savePension")}
          </Button>
        </div>
      </form>
      <LaterLink kit={kit} />
      {active ? (
        <StepDock
          kit={kit}
          step="pension"
          main={{
            label: t("actions.next"),
            form: formId,
            disabled: empty > 0,
            pending,
          }}
          notice={empty > 0 ? t("missingRequired", { count: empty }) : null}
        />
      ) : null}
    </FileSection>
  );
}

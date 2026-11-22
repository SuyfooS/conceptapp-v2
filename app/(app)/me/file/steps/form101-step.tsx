"use client";

import type { SENT_WITH } from "@domain/employee-file-steps";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { useState } from "react";
import { failureKey } from "../failure-words";
import type { FileActionFailure } from "../file-types";
import {
  Failure,
  FileSection,
  focusTitle,
  type Kit,
  LaterLink,
  ltr,
  StepDock,
  useDay,
} from "../flow-kit";

/**
 * Step 5, "טופס 101", on paper (H5a's one way; the approved online form is
 * H5b's, the printed one H7's): what the person does outside the app, why
 * it matters for their tax, how to hand it over, where this year's stands,
 * and "מסרתי את הטופס", which the owner or the accountant then confirms.
 * The step's main action sends the whole file once its details are in; until
 * then it leads to the first still open, and says why. The form on paper
 * never keeps the file back.
 */
export function Form101Step({
  kit,
  active,
  blocker,
  onSend,
  sending,
  sendFailure,
}: {
  kit: Kit;
  active: boolean;
  /** The first of the file's details still open, or null once it can go. */
  blocker: (typeof SENT_WITH)[number] | null;
  /** Sends the whole file: the page's, beside its main action on a desktop too. */
  onSend: () => void;
  sending: boolean;
  /** Why sending was refused, in words. */
  sendFailure: string | null;
}) {
  const { t, data } = kit;
  const day = useDay();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FileActionFailure | null>(null);
  const row = data.taxYear;
  const business = { business: data.businessName };
  // The person marks it again only once it was returned or is due again.
  const canMark =
    row === null || row.status === "returned" || row.status === "change_due";

  async function handIn() {
    if (pending) return;
    setPending(true);
    setFailure(null);
    const result = await kit.actions
      .handInForm101()
      .catch(() => ({ ok: false, failure: "failed" }) as const);
    setPending(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    kit.say(t("form101.handedInSaved", business));
    // The button goes once the file says the form is in: the focus stays
    // with the step.
    focusTitle("form101");
  }

  return (
    <FileSection step="form101" active={active} kit={kit}>
      <Card padding="lg" className="flex flex-col gap-3">
        <p className="text-pretty text-md">{t("form101.body", business)}</p>
        <p className="text-pretty text-base">{t("form101.tax", business)}</p>
        <p className="text-pretty text-base text-ink-2">
          {t("form101.handOver")}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="font-medium text-base">
            {t("steps.name.form101")}{" "}
            {t.rich("form101.year", { year: data.year, ltr })}
          </span>
          <Badge
            tone={
              row?.status === "accepted"
                ? "success"
                : row?.status === "returned" || row?.status === "change_due"
                  ? "warning"
                  : "neutral"
            }
          >
            {t("form101.status", { status: row?.status ?? "none" })}
          </Badge>
        </div>
        {row?.status === "returned" ? (
          <p className="text-base">
            {t("form101.returned", {
              ...business,
              reason: row.returnedReason ?? "other",
            })}
          </p>
        ) : null}
        {row?.status === "change_due" && row.changeDueBy ? (
          <p className="text-base">
            {t("form101.dueBy", { date: day(row.changeDueBy) })}
          </p>
        ) : null}
        {canMark ? (
          <Button
            variant="secondary"
            loading={pending}
            onClick={handIn}
            className="self-start"
          >
            {t("form101.handedIn")}
          </Button>
        ) : null}
        <Failure>
          {failure ? t(`failures.${failureKey(failure)}`) : null}
        </Failure>
      </Card>
      <LaterLink kit={kit} />
      {active ? (
        <StepDock
          kit={kit}
          step="form101"
          main={
            blocker
              ? {
                  label: t(`actions.finish.${blocker}`),
                  onClick: () => kit.go(blocker),
                }
              : {
                  label: t("actions.send", business),
                  onClick: onSend,
                  pending: sending,
                }
          }
          notice={blocker ? t("actions.sendWaits") : sendFailure}
        />
      ) : null}
    </FileSection>
  );
}

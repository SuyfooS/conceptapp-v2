"use client";

import type { PunchProof } from "@domain/punch-code-format";
import { Button } from "@ui/button";
import { CodeSlots, type CodeSlotsStatus } from "@ui/code-slots";
import { Sheet } from "@ui/sheet";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { ClockActionResult } from "./clock-types";

type Failure = Exclude<ClockActionResult, { ok: true }>["failure"];

/** How long the accepted digits show their check before the sheet goes. */
const SUCCESS_MS = 600;

/**
 * Clocking in or out with the six digits under the code a manager is showing.
 * Wrong digits drain away for the ones shown now; after too many, typing waits
 * and "without a code" becomes the way on. The block is the panel's, so it
 * holds each time the sheet opens. The sheet stays mounted, closed, so it
 * opens inside the business's colour; what is inside starts afresh each time.
 */
export function PunchCodeSheet({
  open,
  onOpenChange,
  direction,
  locked,
  punchWith,
  onWithoutCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: "in" | "out";
  /** Typing is blocked for now, after too many wrong digits. */
  locked: boolean;
  punchWith: (
    direction: "in" | "out",
    proof: PunchProof,
  ) => Promise<ClockActionResult>;
  onWithoutCode: () => void;
}) {
  const t = useTranslations("app.clock");
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t(direction === "in" ? "type.titleIn" : "type.titleOut")}
      subtitle={t("type.subtitle")}
      closeLabel={t("team.sheet.close")}
    >
      <TypeDigits
        direction={direction}
        locked={locked}
        punchWith={punchWith}
        onDone={() => onOpenChange(false)}
        onWithoutCode={onWithoutCode}
      />
    </Sheet>
  );
}

function TypeDigits({
  direction,
  locked,
  punchWith,
  onDone,
  onWithoutCode,
}: {
  direction: "in" | "out";
  locked: boolean;
  punchWith: (
    direction: "in" | "out",
    proof: PunchProof,
  ) => Promise<ClockActionResult>;
  onDone: () => void;
  onWithoutCode: () => void;
}) {
  const t = useTranslations("app.clock");
  const [status, setStatus] = useState<CodeSlotsStatus>("idle");
  const [failure, setFailure] = useState<Failure | null>(null);
  // The slots send only when they fill up, so after a refusal that isn't the
  // digits' fault they start again empty, without the danger colour.
  const [attempt, setAttempt] = useState(0);
  const [, start] = useTransition();
  const busy = status === "pending" || status === "success";

  function submit(digits: string) {
    setStatus("pending");
    setFailure(null);
    start(async () => {
      const result = await punchWith(direction, { kind: "typed", digits });
      if (result.ok) {
        setStatus("success");
        setTimeout(onDone, SUCCESS_MS);
        return;
      }
      setFailure(result.failure);
      // Wrong digits drain away, ready for the ones shown now.
      if (result.failure === "code" || result.failure === "ownCode") {
        setStatus("error");
        return;
      }
      setStatus("idle");
      if (result.failure !== "codeLocked") setAttempt((n) => n + 1);
    });
  }

  // CodeSlots has no disabled state: while typing is blocked, it isn't there,
  // and the block is said for as long as it lasts.
  const shownFailure = locked
    ? "codeLocked"
    : failure === "codeLocked"
      ? null
      : failure;
  return (
    <div className="flex flex-col gap-3 px-1 pt-1">
      {locked ? null : (
        <CodeSlots
          key={attempt}
          name="digits"
          label={t("type.label")}
          status={status}
          onComplete={submit}
          autoFocus
          autoComplete="off"
          slotClassName="bg-elevated"
        />
      )}
      {shownFailure ? (
        <p role="alert" className="px-1 text-center font-medium text-danger">
          {t(`failure.${shownFailure}`)}
        </p>
      ) : null}
      <Button
        variant={locked ? "secondary" : "ghost"}
        size={locked ? "lg" : "md"}
        disabled={busy}
        onClick={onWithoutCode}
      >
        {t("none.open")}
      </Button>
    </div>
  );
}

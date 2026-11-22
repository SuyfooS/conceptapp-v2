"use client";

import type { RevealField } from "@domain/employee-file";
import { MaskedValue, type RevealOutcome } from "@ui/masked-value";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { holderWordsOf } from "./holder-failure-words";
import type {
  HolderFileActions,
  RevealHolderAnswer,
} from "./holder-file-types";

/**
 * One number of someone's file for a holder (profile H6a): its last digits,
 * and "הצגה" for a minute, asked of the server each time (logged there).
 * Over the hour's limit it says so in words; a file locked meanwhile (no
 * fresh step-up) or a duties' wording changed draws the page again, locked
 * or with the duties, and nothing is said here. The twin goes to its locked
 * state instead (`lockedHref`).
 */
export function HolderReveal({
  field,
  label,
  masked,
  reveal,
  lockedHref,
}: {
  field: RevealField;
  label: string;
  masked: string;
  reveal: HolderFileActions["reveal"];
  lockedHref?: string;
}) {
  const t = useTranslations("app.team.file");
  const tf = useTranslations("app.file.masked");
  const router = useRouter();

  async function onReveal(): Promise<RevealOutcome> {
    const answer = await reveal(field).catch(
      (): RevealHolderAnswer => ({ ok: false, failure: "failed" }),
    );
    if (answer.ok) return answer.value;
    if (answer.failure === "stepUp" || answer.failure === "ack") {
      if (lockedHref && answer.failure === "stepUp") router.push(lockedHref);
      else router.refresh();
      return { held: true };
    }
    const key = holderWordsOf(answer.failure, "reveal");
    return key === "reveal.limit" ||
      key === "reveal.noAccess" ||
      key === "unavailable"
      ? { message: t(key) }
      : null;
  }

  return (
    <MaskedValue
      label={label}
      masked={masked}
      onReveal={onReveal}
      showLabel={tf("show")}
      hideLabel={tf("hide")}
      hiddenLabel={tf("hidden", { what: label })}
      failedLabel={tf("failed")}
    />
  );
}

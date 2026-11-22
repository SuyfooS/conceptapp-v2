"use client";

import { splitPastedAccount } from "@domain/bank-account";
import { cleanTyped } from "@domain/typed-text";
import { type ReactNode, useId, useState } from "react";
import { Button } from "./button";
import { ChoiceMenu, choiceShown } from "./choice-menu";
import { cn } from "./cn";
import { fieldInputClass, ltrInputClass, TextField } from "./text-field";

/** An account as typed: the bank by code, the branch and the number as text. */
export type BankFieldValue = {
  bank: number | null;
  branch: string;
  account: string;
  /** "המספר נכון, לשמור": the person saves past the check's warning. */
  kept: boolean;
};

export const EMPTY_BANK: BankFieldValue = {
  bank: null,
  branch: "",
  account: "",
  kept: false,
};

const digits = (raw: string, most: number) =>
  cleanTyped(raw).replace(/\D/g, "").slice(0, most);

/**
 * A bank account for wages (the hiring file, H5a): a box to paste what the
 * bank's app copies, which fills the three parts when it reads them
 * (`splitPastedAccount`), then the bank from a list, the branch and the
 * account, left to right. The caller checks what is typed
 * (`checkBankAccount`) and passes the warning in words: it shows under the
 * account with a quiet way to keep the number as it is, since Masav's rules
 * change and a warning only flags the account for a holder. Changing any
 * part takes that back. Its words are the caller's.
 */
export function BankField({
  labels,
  banks,
  value,
  onChange,
  warning,
  error,
}: {
  labels: {
    paste: string;
    pasteHint: ReactNode;
    pasteNone: string;
    bank: string;
    choose: string;
    branch: string;
    account: string;
    where: string;
    keep: string;
    kept: string;
  };
  /** The banks to choose from, by name. */
  banks: readonly { code: number; name: string }[];
  value: BankFieldValue;
  onChange: (value: BankFieldValue) => void;
  /** The check's words for what is typed: a warning the person may save past. */
  warning: string | null;
  /** What can't be kept at all, in words. */
  error?: string | null;
}) {
  const statusId = useId();
  const [pasted, setPasted] = useState("");
  const [unread, setUnread] = useState(false);

  function paste(text: string) {
    const split = splitPastedAccount(text);
    if (split.kind === "full") {
      onChange({
        bank: split.bank,
        branch: String(split.branch),
        account: split.account,
        kept: false,
      });
    } else if (split.kind === "branchAndAccount") {
      onChange({
        ...value,
        branch: String(split.branch),
        account: split.account,
        kept: false,
      });
    }
    // Read: the parts below hold it now, and the box is ready for another.
    if (split.kind !== "none") {
      setPasted("");
      setUnread(false);
      return;
    }
    setPasted(text);
    // Only once there is enough to be a number: never while it is typed.
    setUnread(cleanTyped(text).replace(/\D/g, "").length >= 6);
  }

  const options = banks.map((bank) => ({
    key: String(bank.code),
    label: bank.name,
    hint: String(bank.code).padStart(2, "0"),
  }));
  // A bank the list doesn't have (pasted or stored) still shows by its code.
  if (value.bank !== null && !banks.some((bank) => bank.code === value.bank)) {
    options.push({
      key: String(value.bank),
      label: String(value.bank).padStart(2, "0"),
      hint: "",
    });
  }
  const chosen = value.bank === null ? "" : String(value.bank);
  const shown = choiceShown(options, chosen, labels.choose) ?? labels.choose;

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={labels.paste}
        value={pasted}
        onChange={(event) => paste(event.target.value)}
        hint={labels.pasteHint}
        error={unread ? labels.pasteNone : undefined}
        dir="ltr"
        className={ltrInputClass}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <div className="flex flex-col gap-1.5">
        <span aria-hidden="true" className="font-medium text-ink text-sm">
          {labels.bank}
        </span>
        <ChoiceMenu
          label={`${labels.bank}: ${shown}`}
          value={chosen}
          options={options}
          onChange={(key) =>
            onChange({ ...value, bank: Number(key), kept: false })
          }
          placeholder={labels.choose}
          className={cn(
            fieldInputClass,
            "justify-between font-normal",
            value.bank === null ? "text-ink-2" : "text-ink",
          )}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
        <TextField
          label={labels.branch}
          value={value.branch}
          onChange={(event) =>
            onChange({
              ...value,
              branch: digits(event.target.value, 3),
              kept: false,
            })
          }
          dir="ltr"
          className={cn(ltrInputClass, "tabular-nums")}
          inputMode="numeric"
          autoComplete="off"
        />
        <TextField
          label={labels.account}
          value={value.account}
          onChange={(event) =>
            onChange({
              ...value,
              account: digits(event.target.value, 13),
              kept: false,
            })
          }
          error={error ?? undefined}
          aria-describedby={warning ? statusId : undefined}
          dir="ltr"
          className={cn(ltrInputClass, "tabular-nums")}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>
      <p className="-mt-2 text-ink-2 text-sm">{labels.where}</p>
      <div id={statusId} role="status">
        {warning ? (
          <div className="flex flex-col items-start gap-2 rounded-control bg-warning-soft p-3.5 text-ink">
            <p className="text-base">{warning}</p>
            {value.kept ? (
              <p className="font-medium text-base">{labels.kept}</p>
            ) : (
              <Button
                variant="secondary"
                onClick={() => onChange({ ...value, kept: true })}
                className="bg-surface"
              >
                {labels.keep}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

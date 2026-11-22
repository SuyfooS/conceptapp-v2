import type { EmergencyContact, FileRow } from "@domain/employee-file";
import type { PastBack, PastFileData } from "./past-file-types";

/*
 * What a former worker's old file holds and which of its parts show
 * (profile H5c), with no server and no words: the app's read and the twin's
 * mock data take the same.
 */

/**
 * Whether the file holds anything of the person's: its row, a Form 101
 * year or an emergency contact. A business is listed under "עבודות
 * קודמות" only then, and its screen says so otherwise.
 */
export function fileHolds(read: {
  file: FileRow | null;
  taxYears: readonly unknown[];
  emergency: EmergencyContact | null;
}): boolean {
  return (
    read.file !== null || read.taxYears.length > 0 || read.emergency !== null
  );
}

/**
 * The parts the screen draws: the identity and the pension always (every
 * business asks them), the ways to reach them, the account and Form 101
 * where the file holds them or a holder marked them handed on directly.
 * Whatever the business asks now: its settings can't be read after
 * leaving, and what the file holds is the person's.
 */
export type PastParts = {
  identity: true;
  contact: boolean;
  bank: boolean;
  pension: true;
  form101: boolean;
};

type PartsInput = Pick<
  PastFileData,
  "file" | "address" | "email" | "workLanguage" | "emergency" | "taxYears"
>;

export function pastPartsOf(data: PartsInput): PastParts {
  const direct = data.file?.direct_groups ?? [];
  return {
    identity: true,
    contact:
      data.address !== null ||
      data.email !== null ||
      data.workLanguage !== null ||
      data.emergency !== null ||
      direct.includes("address"),
    bank: (data.file?.bank_code ?? null) !== null || direct.includes("bank"),
    pension: true,
    form101: data.taxYears.length > 0,
  };
}

/** The contact part's title, as the flow names step 2: with the address, or the ways to reach them alone. */
export function contactTitleKey(
  data: Pick<PastFileData, "address" | "file">,
): "steps.name.address" | "steps.name.contact" {
  return data.address !== null ||
    (data.file?.direct_groups.includes("address") ?? false)
    ? "steps.name.address"
    : "steps.name.contact";
}

/**
 * Where "back" leads: the profile, or Home, where the screen of someone with
 * no business is drawn (at every path) with its list.
 */
export function pastBackHref(back: PastBack): string {
  return back === "profile" ? "/me" : "/home";
}

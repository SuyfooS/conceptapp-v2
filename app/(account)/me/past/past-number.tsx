"use client";

import type { RevealField } from "@domain/employee-file";
import { MaskedValue } from "@ui/masked-value";
import type { RevealAnswer } from "../../../(app)/me/file/file-types";

/**
 * One number of a former worker's old file (profile H5c): its last digits,
 * and "הצגה", which asks the server for it by the page's action, a POST,
 * one number at a time. It hides again as `MaskedValue` hides it. Its words
 * are the server's, in the person's language.
 */
export function PastNumber({
  field,
  label,
  masked,
  words,
  reveal,
}: {
  field: RevealField;
  /** What the number is: "מספר זהות". */
  label: string;
  /** "•••0018". */
  masked: string;
  words: { show: string; hide: string; hidden: string; failed: string };
  reveal: (field: RevealField) => Promise<RevealAnswer>;
}) {
  return (
    <MaskedValue
      label={label}
      masked={masked}
      onReveal={async () => {
        const answer = await reveal(field);
        return answer.ok ? answer.value : null;
      }}
      showLabel={words.show}
      hideLabel={words.hide}
      hiddenLabel={words.hidden}
      failedLabel={words.failed}
    />
  );
}

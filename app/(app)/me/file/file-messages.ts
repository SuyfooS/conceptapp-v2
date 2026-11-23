import "server-only";
import type he from "@/messages/he.json";

/**
 * The words the file's client parts read, and no more: its own, the banks'
 * and the pension funds' names, the code boxes' and the "אני לא רובוט"
 * check's. The English frame
 * gives the browser these alone, so the rest of the app's English stays
 * home (file-messages.test.ts holds the list to what the parts read).
 */
export function fileMessages(messages: typeof he) {
  return {
    app: { file: messages.app.file },
    banks: messages.banks,
    pensionFunds: messages.pensionFunds,
    ui: { codeSlots: messages.ui.codeSlots, captcha: messages.ui.captcha },
  };
}

/** The namespaces `fileMessages` carries, as the client parts name them. */
export const FILE_NAMESPACES = [
  "app.file",
  "banks",
  "pensionFunds",
  "ui.codeSlots",
  "ui.captcha",
] as const;

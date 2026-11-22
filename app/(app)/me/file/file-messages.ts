import "server-only";
import type he from "@/messages/he.json";

/**
 * The words the file's client parts read, and no more: its own, the banks'
 * and the pension funds' names, and the code boxes'. The English frame
 * gives the browser these alone, so the rest of the app's English stays
 * home (file-messages.test.ts holds the list to what the parts read).
 */
export function fileMessages(messages: typeof he) {
  return {
    app: { file: messages.app.file },
    banks: messages.banks,
    pensionFunds: messages.pensionFunds,
    ui: { codeSlots: messages.ui.codeSlots },
  };
}

/** The namespaces `fileMessages` carries, as the client parts name them. */
export const FILE_NAMESPACES = [
  "app.file",
  "banks",
  "pensionFunds",
  "ui.codeSlots",
] as const;

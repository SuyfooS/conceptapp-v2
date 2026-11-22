import { accentTokens } from "@domain/color";
import { fileStepOf } from "@domain/employee-file-steps";
import type { ProfileLocale } from "@domain/profile";
import { accentProps } from "@ui/accent";
import en from "@/messages/en.json";
import type he from "@/messages/he.json";
import { FileFlow, type FileView as View } from "./file-flow";
import { FileFrame } from "./file-frame";
import { fileMessages } from "./file-messages";
import type { FileActions, FileScreenData } from "./file-types";
import type { BankPreset } from "./steps/bank-step";

/** The screen `?step=` names: a step, the done screen, or none. */
export function fileViewOf(param: unknown): View {
  return param === "done" ? "done" : fileStepOf(param);
}

/**
 * The worker's own file (profile H5a), drawn by /me/file and by its twin.
 * Someone who chose English reads it in English: its words alone go to the
 * browser in a provider of their own, in a left-to-right frame that keeps
 * the business's colour (its sheets open inside it). The rest of the app
 * stays Hebrew, and a business's own sentences, which are Hebrew, don't
 * apply here. Both languages draw the same frame (`FileFrame`), so the
 * language button keeps what was typed in the step on screen.
 */
export function FileView({
  data,
  view,
  actions,
  base = "",
  profileHref = "/me",
  keep,
  preset,
}: {
  data: FileScreenData;
  view: View;
  actions: FileActions;
  base?: string;
  profileHref?: string;
  /** The twin's own query in each language, kept from step to step. */
  keep?: Record<ProfileLocale, string>;
  preset?: { bank?: BankPreset };
}) {
  const english = data.locale === "en";
  return (
    <FileFrame
      english={english}
      messages={english ? fileMessages(en as typeof he) : undefined}
      timeZone={data.timeZone}
      accent={english ? accentProps(accentTokens(data.accent)) : undefined}
    >
      <FileFlow
        data={data}
        view={view}
        actions={actions}
        base={base}
        profileHref={profileHref}
        keep={keep}
        preset={preset}
      />
    </FileFrame>
  );
}

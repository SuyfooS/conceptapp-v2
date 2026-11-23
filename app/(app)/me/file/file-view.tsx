import { accentTokens } from "@domain/color";
import { type FileStep, fileStepOf } from "@domain/employee-file-steps";
import type { ProfileLocale } from "@domain/profile";
import type { CaptchaSetup } from "@domain/turnstile";
import { accentProps } from "@ui/accent";
import en from "@/messages/en.json";
import type he from "@/messages/he.json";
import { FileFlow, type FileView as View } from "./file-flow";
import { FileFrame } from "./file-frame";
import { fileMessages } from "./file-messages";
import type { FileActions, FileScreenData } from "./file-types";
import type { BankPreset } from "./steps/bank-step";

/**
 * The screen `?step=` names: a step on screen, the done screen, or none (a
 * step the business doesn't ask opens where the person stopped).
 */
export function fileViewOf(param: unknown, steps: readonly FileStep[]): View {
  return param === "done" ? "done" : fileStepOf(param, steps);
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
  captcha,
  base = "",
  profileHref = "/me",
  keep,
  preset,
}: {
  data: FileScreenData;
  view: View;
  actions: FileActions;
  /** The "אני לא רובוט" check before the bank's code: this deployment's widget, or the twin's stand-in. */
  captcha: CaptchaSetup;
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
        captcha={captcha}
        base={base}
        profileHref={profileHref}
        keep={keep}
        preset={preset}
      />
    </FileFrame>
  );
}

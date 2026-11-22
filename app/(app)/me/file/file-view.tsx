import { accentTokens } from "@domain/color";
import { fileStepOf } from "@domain/employee-file-steps";
import { accentProps } from "@ui/accent";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import type he from "@/messages/he.json";
import { FileFlow, type FileView as View } from "./file-flow";
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
 * apply here.
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
  /** The twin's own query, kept from step to step. */
  keep?: string;
  preset?: { bank?: BankPreset };
}) {
  const flow = (
    <FileFlow
      data={data}
      view={view}
      actions={actions}
      base={base}
      profileHref={profileHref}
      keep={keep}
      preset={preset}
    />
  );
  if (data.locale !== "en") return flow;
  return (
    <NextIntlClientProvider
      locale="en"
      timeZone={data.timeZone}
      messages={fileMessages(en as typeof he)}
    >
      <div dir="ltr" lang="en" {...accentProps(accentTokens(data.accent))}>
        {flow}
      </div>
    </NextIntlClientProvider>
  );
}

import { Suspense } from "react";
import { FileView, fileViewOf } from "../../../../(app)/me/file/file-view";
import { demoSaveProfileAction } from "../actions";
import {
  demoConfirmBankAction,
  demoHandInForm101Action,
  demoRevealAction,
  demoSaveFileStepAction,
  demoSendBankCodeAction,
  demoSubmitFileAction,
} from "./actions";
import { fileDemoStateOf, fileScreenDemo } from "./data";

type Props = {
  searchParams: Promise<{ step?: string; state?: string; lang?: string }>;
};

// The worker's own file (profile H5a) with Noa's mock file, drawn by the
// real view. By default she stopped at the account; `?step=` opens a step,
// `?state=new` has nothing yet (the welcome), `minor` a 16-year-old's birth
// date, `warning` an account the check warns about, `code` its code asked
// for (the twin takes 123456), `saved` the account in, `done` everything
// sent. `?lang=en` is her file in English, as the app draws it for someone
// who chose English.
export default function FileDemoPage({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { step, state, lang } = await searchParams;
  const which = fileDemoStateOf(state);
  const english = lang === "en";
  const { data, preset } = fileScreenDemo(which, english ? "en" : "he");
  const view =
    fileViewOf(step) ??
    (which === "done"
      ? "done"
      : which === "warning" || which === "code" || which === "saved"
        ? "bank"
        : which === "minor"
          ? "identity"
          : null);
  const keep = [
    which === "stopped" ? null : `state=${which}`,
    english ? "lang=en" : null,
  ]
    .filter(Boolean)
    .join("&");
  return (
    <FileView
      data={data}
      view={view}
      preset={preset}
      base="/design/shell"
      profileHref="/design/shell/me?file=missing"
      keep={keep}
      actions={{
        saveStep: demoSaveFileStepAction,
        reveal: demoRevealAction,
        sendBankCode: demoSendBankCodeAction,
        confirmBank: demoConfirmBankAction,
        handInForm101: demoHandInForm101Action,
        submit: demoSubmitFileAction,
        saveProfile: demoSaveProfileAction,
      }}
    />
  );
}

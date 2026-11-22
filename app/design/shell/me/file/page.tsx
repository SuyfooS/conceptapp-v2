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
// for (the twin takes 123456), `hold` an account held in the week after a
// phone change, `saved` the account in, `done` everything sent (and a new
// address there makes an updated 101 due). `?lang=en` is her file in
// English, as the app draws it for someone who chose English; the language
// button and step 0 switch it there, since the twin keeps nothing.
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
      : which === "warning" ||
          which === "code" ||
          which === "hold" ||
          which === "saved"
        ? "bank"
        : which === "minor"
          ? "identity"
          : null);
  // Its state in its address, in either language.
  const kept = which === "stopped" ? null : `state=${which}`;
  const keep = {
    he: kept ?? "",
    en: [kept, "lang=en"].filter(Boolean).join("&"),
  };
  return (
    <FileView
      data={data}
      view={view}
      preset={preset}
      base="/design/shell"
      profileHref="/design/shell/me?file=missing"
      keep={keep}
      actions={{
        saveStep: demoSaveFileStepAction.bind(null, which),
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

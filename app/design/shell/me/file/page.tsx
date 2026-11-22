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
import {
  fileDemoAskOf,
  fileDemoForm101Of,
  fileDemoStateOf,
  fileScreenDemo,
} from "./data";

type Props = {
  searchParams: Promise<{
    step?: string;
    state?: string;
    lang?: string;
    ask?: string;
    form101?: string;
  }>;
};

// The worker's own file (profile H5a) with Noa's mock file, drawn by the
// real view. By default she stopped at the account; `?step=` opens a step,
// `?state=new` has nothing yet (the welcome), `minor` a 16-year-old's birth
// date, `warning` an account the check warns about, `code` its code asked
// for (the twin takes 123456), `hold` an account held in the week after a
// phone change, `saved` the account in, `done` everything sent (and a new
// address there makes an updated 101 due), `ready` everything in and not
// sent yet. `?lang=en` is her file in
// English, as the app draws it for someone who chose English; the language
// button and step 0 switch it there, since the twin keeps nothing. What the
// business asks (H5b): `?ask=lean` neither the address nor the account,
// `?ask=contact` the emergency contact and the work language too, `?ask=held`
// neither any more though her file holds both (each step says so); and how
// it takes Form 101: `?form101=link` by an approved system's link,
// `?form101=off` not in the app, so the done screen sends the file.
export default function FileDemoPage({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { step, state, lang, ask, form101 } = await searchParams;
  const which = fileDemoStateOf(state);
  const asks = fileDemoAskOf(ask);
  const way = fileDemoForm101Of(form101);
  const english = lang === "en";
  const { data, preset } = fileScreenDemo(which, english ? "en" : "he", {
    ask: asks,
    form101: way,
  });
  // Each state opens on its own step, where the business asks it.
  const view =
    fileViewOf(step, data.steps) ??
    fileViewOf(
      which === "done"
        ? "done"
        : which === "warning" ||
            which === "code" ||
            which === "hold" ||
            which === "saved"
          ? "bank"
          : which === "minor"
            ? "identity"
            : null,
      data.steps,
    );
  // Its state, what the business asks and its way to Form 101 in its
  // address, in either language.
  const kept = [
    which === "stopped" ? null : `state=${which}`,
    asks === "all" ? null : `ask=${asks}`,
    way === "print" ? null : `form101=${way}`,
  ].filter(Boolean);
  const keep = {
    he: kept.join("&"),
    en: [...kept, "lang=en"].join("&"),
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

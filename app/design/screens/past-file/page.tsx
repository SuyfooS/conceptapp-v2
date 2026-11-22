import { Suspense } from "react";
import {
  PastFileView,
  PastUnavailable,
} from "../../../(account)/me/past/past-file-view";
import { demoRevealPastAction } from "../../shell/me/file/actions";
import {
  pastDemoStateOf,
  pastFileDemo,
  pastJobDemo,
} from "../../shell/me/file/data";

type Props = {
  searchParams: Promise<{ state?: string; lang?: string; from?: string }>;
};

// A former worker's old file (profile H5c) with Noa's mock file from the
// café she left, drawn by the real view outside the app's frame, as the
// real screen is. "הצגה" shows the twin's made-up numbers and keeps
// nothing. `?state=passport` has a passport instead of her ID (and shows
// the passport's number),
// `?state=returned` this year's 101 returned; `?state=off` the business no
// longer using the file, `empty` nothing of hers in it, `viewing` the
// ConceptApp team viewing as a role, `unavailable` no keys here.
// `?lang=en` is in English, as for someone who chose it. `?from=none` goes
// back to the screen of someone with no business and its list, else to
// the profile's.
export default function PastFileDemo({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state, lang, from } = await searchParams;
  const locale = lang === "en" ? "en" : "he";
  const none = from === "none";
  const back = none ? "list" : "profile";
  const backHref = none
    ? "/design/screens/no-business?state=left&past=1"
    : "/design/shell/me?past=1";
  if (
    state === "off" ||
    state === "empty" ||
    state === "viewing" ||
    state === "unavailable"
  ) {
    return (
      <PastUnavailable
        screen={{ kind: state, job: pastJobDemo, locale, back }}
        backHref={backHref}
      />
    );
  }
  const shown = pastDemoStateOf(state);
  return (
    <PastFileView
      data={pastFileDemo(locale, shown, back)}
      reveal={demoRevealPastAction.bind(null, shown)}
      backHref={backHref}
    />
  );
}

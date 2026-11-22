import { signInPath } from "@domain/passive-sign-in";
import { PageSkeleton } from "@ui/skeleton";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { currentMember } from "../(app)/member";
import { baseWording, translator } from "../(app)/wording";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// A signed-in person's own screens that need no business (profile H5c: a
// former worker's old file), outside the app's frame, for someone with no
// business and someone in another alike. Who is signed in is read per
// request, behind a Suspense boundary (cacheComponents). No security
// boundary (a layout isn't drawn again on a client navigation): each page
// and action checks again. The ConceptApp team isn't sent to the console
// from here: an old file is the person's own, and a view session reads none.
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

// Before anyone is read: the app's own words.
function Loading() {
  const t = translator(baseWording, "app");
  return <PageSkeleton label={t("loading")} />;
}

async function SignedIn({ children }: { children: ReactNode }) {
  if (!(await currentMember())) redirect(signInPath);
  return children;
}

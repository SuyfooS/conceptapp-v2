import { demoDoorOpen } from "@db/env";
import { signInPath } from "@domain/passive-sign-in";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { signIn } from "../actions";
import { AuthScreen } from "../auth-screen";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function SignInPage() {
  const t = useTranslations("auth.signIn");
  // The way back to the demo only on a site that offers it (DEMO_DOOR). Read
  // when the page is built, so a setting that is neither fails the build.
  const demoHref = demoDoorOpen() ? signInPath : undefined;
  return (
    <AuthScreen title={t("title")}>
      <SignInForm signIn={signIn} demoHref={demoHref} />
    </AuthScreen>
  );
}

import { demoDoorOpen } from "@db/env";
import { phoneSignInPath } from "@domain/passive-sign-in";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthScreen } from "../auth-screen";
import { enterAs, resetDemo } from "./actions";
import { EnterForm } from "./enter-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.enter");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function EnterPage() {
  const t = useTranslations("auth.enter");
  // A site whose demo door is closed (DEMO_DOOR=off) has no demo here: real
  // sign-in instead. The proxy sends it on first; this holds without it.
  if (!demoDoorOpen()) redirect(phoneSignInPath);
  return (
    <AuthScreen title={t("title")}>
      <EnterForm
        enter={enterAs}
        reset={resetDemo}
        signInHref={phoneSignInPath}
      />
    </AuthScreen>
  );
}

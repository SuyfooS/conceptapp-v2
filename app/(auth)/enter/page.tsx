import { PASSIVE_SIGN_IN } from "@domain/passive-sign-in";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthScreen } from "../auth-screen";
import { enterAs } from "./actions";
import { EnterForm } from "./enter-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.enter");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default function EnterPage() {
  const t = useTranslations("auth.enter");
  if (!PASSIVE_SIGN_IN) notFound();
  return (
    <AuthScreen title={t("title")}>
      <EnterForm enter={enterAs} />
    </AuthScreen>
  );
}

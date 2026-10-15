import { Card } from "@ui/card";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

// One task on every device, so one shape: a centred card that is the whole
// screen on a phone and a narrow column on tablet and desktop.
export default function SignInPage() {
  const t = useTranslations("auth.signIn");
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-10 md:items-center md:py-16">
      <Card
        tone="raised"
        padding="lg"
        className="flex w-full max-w-[400px] flex-col gap-4 md:p-8"
      >
        <h1 className="font-bold text-xl md:text-2xl">{t("title")}</h1>
        <SignInForm />
      </Card>
    </main>
  );
}

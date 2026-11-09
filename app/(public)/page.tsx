import { signInPath } from "@domain/passive-sign-in";
import { brandProps } from "@ui/accent";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { DeckCard } from "@ui/card-deck";
import { FocusText } from "@ui/focus-text";
import { Logo } from "@ui/logo";
import { PhoneFrame } from "@ui/phone-frame";
import { SettlingCards } from "@ui/settling-cards";
import { WordCycle } from "@ui/word-cycle";
import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CONTACT_EMAIL, mailHref } from "./contact";
import { ClockDemo, ManageDemo, ScheduleDemo, TodayDemo } from "./demo-screens";

const QUESTIONS = ["closing", "swap", "atWork", "hours", "forgot"] as const;
const SOON = ["lists", "roles"] as const;
const WORDS = [
  "restaurant",
  "carpentry",
  "kitchen",
  "hotel",
  "clothing",
  "electronics",
  "yours",
] as const;
const STEPS = ["write", "setup", "invite"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  const tMeta = await getTranslations("metadata");
  const title = t("metaTitle");
  const description = tMeta("description");
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", locale: "he_IL" },
  };
}

/**
 * The marketing page, for owners of any business with a team. Static and
 * without JavaScript of its own: its motion follows the scroll, in CSS. Signed-in
 * people never see it, the proxy sends them on to the app. It lists what the
 * pilot has; reservations and the storefront stay off it until they are built,
 * and notifications until Orel says how to show them. Sets ConceptApp's own
 * colour in the accent's place, and carries ConceptApp's logo.
 */
export default async function LandingPage() {
  const t = await getTranslations("landing");
  const href = mailHref(t("mail.subject"));

  return (
    <div {...brandProps} className="overflow-x-clip">
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8">
        <nav
          aria-label={t("nav.label")}
          className="glass pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-full py-1 ps-4 pe-1"
        >
          <Logo label={t("brand")} />
          <div className="relative flex items-center gap-1">
            <Button asChild variant="ghost">
              <Link href={signInPath} prefetch={false}>
                {t("nav.signIn")}
              </Link>
            </Button>
            <Button asChild className="hidden md:inline-flex">
              <a href={href}>{t("mail.action")}</a>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <section className="brand-surface grain relative mx-2 mt-2 rounded-sheet md:mx-4 md:mt-4">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 pt-28 md:grid-cols-[minmax(0,1fr)_330px] md:items-center md:gap-8 md:px-8 md:pt-32">
            <div className="flex flex-col items-start gap-6 md:pb-20">
              <h1 className="max-w-[6em] text-balance font-bold text-4xl tracking-tight">
                <FocusText text={t("hero.title")} />
              </h1>
              <p className="max-w-[24em] text-lg">{t("hero.body")}</p>
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="bg-accent-ink text-accent hover:bg-accent-ink hover:opacity-90 focus-visible:outline-accent-ink active:bg-accent-ink"
              >
                <a href={href}>
                  <Mail aria-hidden="true" />
                  {t("mail.action")}
                </a>
              </Button>
            </div>
            <div className="-mb-16 flex justify-center md:-mb-24">
              <PhoneFrame
                label={t("hero.demoLabel")}
                className="w-full max-w-[330px]"
              >
                <TodayDemo />
              </PhoneFrame>
            </div>
          </div>
        </section>

        <SettlingCards
          className="mt-16 md:mt-24"
          head={
            <>
              <h2 className="text-balance font-bold text-3xl">
                {t("questions.title")}
              </h2>
              <p className="max-w-[24em] text-ink-2 text-lg">
                {t("questions.body")}
              </p>
            </>
          }
          items={QUESTIONS.map((key) => ({
            key,
            question: t(`questions.${key}.q`),
            answer: t(`questions.${key}.a`),
          }))}
        />

        <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 md:px-8">
          <h2 className="reveal font-bold text-3xl">{t("features.title")}</h2>
          <div className="flex flex-col gap-4 md:grid md:grid-cols-2 xl:grid-cols-12">
            <DeckCard index={0} className="flex flex-col gap-5 xl:col-span-7">
              <FeatureText
                title={t("features.schedule.title")}
                body={t("features.schedule.body")}
              />
              <ScheduleDemo />
            </DeckCard>
            <DeckCard index={1} className="flex flex-col gap-5 xl:col-span-5">
              <FeatureText
                title={t("features.clock.title")}
                body={t("features.clock.body")}
              />
              <ClockDemo />
            </DeckCard>
            <DeckCard index={2} className="flex flex-col gap-5 xl:col-span-5">
              <FeatureText
                title={t("features.manage.title")}
                body={t("features.manage.body")}
              />
              <ManageDemo />
            </DeckCard>
            <DeckCard index={3} className="flex flex-col gap-5 xl:col-span-7">
              <h3 className="font-bold text-2xl">{t("features.soon.title")}</h3>
              <ul className="grid gap-5 xl:grid-cols-2 xl:gap-8">
                {SOON.map((key) => (
                  <li key={key} className="flex flex-col items-start gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-lg">
                        {t(`features.soon.${key}.title`)}
                      </h4>
                      <Badge tone="accent">{t("features.soon.badge")}</Badge>
                    </div>
                    <p className="text-ink-2">
                      {t(`features.soon.${key}.body`)}
                    </p>
                  </li>
                ))}
              </ul>
            </DeckCard>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 md:px-8 md:py-24">
          <h2 className="font-bold text-3xl tracking-tight md:text-4xl">
            <span className="sr-only">{t("fit.label")}</span>
            <span aria-hidden="true" className="block text-ink-2">
              {t("fit.lead")}
            </span>
            <WordCycle words={WORDS.map((key) => t(`fit.words.${key}`))} />
          </h2>
          <p className="reveal max-w-[32em] text-ink-2 text-lg">
            {t("fit.body")}
          </p>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 md:px-8">
          <h2 className="reveal font-bold text-3xl">{t("steps.title")}</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((key, i) => (
              <li key={key} className="reveal">
                <Card
                  padding="none"
                  className="flex h-full flex-col gap-2 rounded-sheet p-6 md:p-8"
                >
                  <span aria-hidden="true" className="font-bold text-3xl">
                    {i + 1}
                  </span>
                  <h3 className="font-semibold text-lg">
                    {t(`steps.${key}.title`)}
                  </h3>
                  <p className="text-ink-2">{t(`steps.${key}.body`)}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto mt-16 max-w-6xl px-4 md:mt-24 md:px-8">
          <Card
            tone="accent"
            padding="none"
            className="reveal flex flex-col items-start gap-5 rounded-sheet p-8 md:p-14"
          >
            <h2 className="text-balance font-bold text-3xl">
              {t("contact.title")}
            </h2>
            <p className="max-w-[28em] text-lg">{t("contact.body")}</p>
            <Button asChild size="lg">
              <a href={href}>
                <Mail aria-hidden="true" />
                {t("mail.action")}
              </a>
            </Button>
            <p className="text-base">
              {t.rich("contact.direct", {
                email: CONTACT_EMAIL,
                mail: (chunks) => (
                  <a
                    dir="ltr"
                    href={href}
                    className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </Card>
        </section>
      </main>

      <footer className="mx-auto mt-12 flex max-w-6xl flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex flex-col items-start gap-1">
          <Logo label={t("brand")} />
          <p className="text-ink-2 text-sm">{t("footer.sample")}</p>
        </div>
        <Link
          href={signInPath}
          prefetch={false}
          className="inline-flex min-h-11 items-center self-start font-medium text-base underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 md:self-auto"
        >
          {t("footer.signIn")}
        </Link>
      </footer>
    </div>
  );
}

function FeatureText({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-bold text-2xl">{title}</h3>
      <p className="text-ink-2">{body}</p>
    </div>
  );
}

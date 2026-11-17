import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { glowClass } from "@ui/page-glow";
import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

const BASE = "/design/order-taking";

/** Every screen of S0 and its states, in the order a service runs. */
const SECTIONS = [
  {
    key: "waiter",
    screens: [
      { key: "floor", href: `${BASE}/floor` },
      { key: "quiet", href: `${BASE}/floor?state=quiet` },
      { key: "free", href: `${BASE}/floor/order?place=table-6` },
      { key: "draft", href: `${BASE}/floor/order?place=table-6&state=draft` },
      { key: "choice", href: `${BASE}/floor/order?place=table-6&state=choice` },
      { key: "sent", href: `${BASE}/floor/order?place=table-6&state=sent` },
      { key: "open", href: `${BASE}/floor/order?place=table-4` },
      { key: "tillItem", href: `${BASE}/floor/till?order=order-4` },
      {
        key: "tillRound",
        href: `${BASE}/floor/till?order=order-4&state=byRound`,
      },
      { key: "tillClosed", href: `${BASE}/floor/till?order=order-3` },
      { key: "mine", href: `${BASE}/mine` },
      { key: "mineEmpty", href: `${BASE}/mine?state=nothingSent` },
    ],
  },
  {
    key: "prep",
    screens: [
      { key: "prep", href: `${BASE}/prep` },
      { key: "prepEmpty", href: `${BASE}/prep?state=nothingOpen` },
      { key: "kitchen", href: `${BASE}/station/prep` },
      { key: "kitchenOpen", href: `${BASE}/station/prep?state=open` },
      { key: "kitchenOffline", href: `${BASE}/station/prep?state=offline` },
      { key: "kitchenEmpty", href: `${BASE}/station/prep?state=nothingOpen` },
      { key: "counter", href: `${BASE}/station/till` },
    ],
  },
  {
    key: "menu",
    screens: [
      { key: "menu", href: `${BASE}/menu` },
      { key: "noMenu", href: `${BASE}/menu?state=noMenu` },
      { key: "import", href: `${BASE}/menu/import` },
    ],
  },
] as const;

// The order-taking demo's list of screens (S0 of waiter mode, issue #191),
// for Orel to tap through, and the order a real waiter times against the
// pad (§3.4). Each link opens the demo afresh in that state.
export default function OrderTakingDemoIndex() {
  const t = useTranslations("design.orderTaking.index");
  return (
    <div className={`min-h-dvh ${glowClass}`}>
      <PageBody className="max-w-3xl">
        <PageHeader
          back={{ href: "/design", label: t("back") }}
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />
        <section aria-label={t("test.label")}>
          <Card tone="hero" padding="lg" className="flex flex-col gap-3">
            <span className="font-medium text-base">{t("test.label")}</span>
            <h2 className="text-balance font-bold text-xl">
              {t("test.title")}
            </h2>
            <p className="text-base">{t("test.body")}</p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="mt-1 bg-accent-ink text-accent hover:bg-accent-ink hover:opacity-90 active:bg-accent-ink focus-visible:outline-accent-ink md:self-start"
            >
              <Link href={`${BASE}/floor?state=quiet`}>
                <LayoutGrid aria-hidden="true" />
                {t("test.action")}
              </Link>
            </Button>
          </Card>
        </section>
        {SECTIONS.map((section) => (
          <PageSection key={section.key} title={t(`sections.${section.key}`)}>
            <ListGroup>
              {section.screens.map((screen) => (
                <ListRow
                  key={screen.key}
                  href={screen.href}
                  title={t(`screens.${screen.key}.title`)}
                  subtitle={t(`screens.${screen.key}.text`)}
                />
              ))}
            </ListGroup>
          </PageSection>
        ))}
        <p className="px-1 text-ink-2 text-sm">{t("note")}</p>
      </PageBody>
    </div>
  );
}

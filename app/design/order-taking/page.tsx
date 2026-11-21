import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { glowClass } from "@ui/page-glow";
import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

const BASE = "/design/order-taking";

/**
 * Every screen of S0 and its states, in the order a service runs. Each
 * link names its state, the plain ones `service` (the evening at 20:42):
 * the store above the screens opens afresh only for a link with a state,
 * and one without would show what the last link or the walk left.
 */
const SECTIONS = [
  {
    key: "waiter",
    screens: [
      { key: "floor", href: `${BASE}/floor?state=service` },
      { key: "floorUnsent", href: `${BASE}/floor?state=asking` },
      { key: "floorOffline", href: `${BASE}/floor?state=offline` },
      { key: "quiet", href: `${BASE}/floor?state=quiet` },
      { key: "readyNow", href: `${BASE}/floor?state=readyNow` },
      { key: "offClock", href: `${BASE}/floor?state=offClock` },
      { key: "staleShift", href: `${BASE}/floor?state=staleShift` },
      { key: "floorNoPlaces", href: `${BASE}/floor?state=noPlaces` },
      { key: "viewing", href: `${BASE}/floor?state=viewing` },
      { key: "lost", href: `${BASE}/floor?state=lost` },
      { key: "free", href: `${BASE}/floor/order?place=table-6&state=service` },
      { key: "draft", href: `${BASE}/floor/order?place=table-6&state=draft` },
      { key: "sent", href: `${BASE}/floor/order?place=table-6&state=sent` },
      {
        key: "pending",
        href: `${BASE}/floor/order?place=table-6&state=pending`,
      },
      {
        key: "asking",
        href: `${BASE}/floor/order?place=table-6&state=asking`,
      },
      {
        key: "offline",
        href: `${BASE}/floor/order?place=table-6&state=offline`,
      },
      {
        key: "soldOut",
        href: `${BASE}/floor/order?place=table-6&state=soldOut`,
      },
      { key: "taken", href: `${BASE}/floor/order?place=table-6&state=taken` },
      {
        key: "choices",
        href: `${BASE}/floor/order?place=table-6&state=choices`,
      },
      {
        key: "choicesChanged",
        href: `${BASE}/floor/order?place=table-6&state=choicesChanged`,
      },
      {
        key: "takeaway",
        href: `${BASE}/floor/order?place=takeaway-new&state=service`,
      },
      { key: "open", href: `${BASE}/floor/order?place=table-4&state=service` },
      { key: "fixed", href: `${BASE}/floor/order?place=table-4&state=fixed` },
      {
        key: "tillItem",
        href: `${BASE}/floor/till?order=order-4&state=service`,
      },
      {
        key: "tillRound",
        href: `${BASE}/floor/till?order=order-4&state=byRound`,
      },
      {
        key: "tillFixed",
        href: `${BASE}/floor/till?order=order-4&state=fixed`,
      },
      {
        key: "tillClosed",
        href: `${BASE}/floor/till?order=order-3&state=service`,
      },
      {
        key: "reopenTaken",
        href: `${BASE}/floor/till?order=order-3&state=reopenTaken`,
      },
      {
        key: "tillCancelled",
        href: `${BASE}/floor/till?order=order-takeaway-2&state=service`,
      },
      { key: "mine", href: `${BASE}/mine?state=service` },
      { key: "mineEmpty", href: `${BASE}/mine?state=nothingSent` },
      { key: "manageLine", href: "/design/shell/manage/order_taking" },
    ],
  },
  {
    key: "prep",
    screens: [
      { key: "prep", href: `${BASE}/prep?state=service` },
      { key: "prepEmpty", href: `${BASE}/prep?state=nothingOpen` },
      { key: "prepKitchen", href: `${BASE}/prep?state=kitchen` },
      { key: "kitchen", href: `${BASE}/station/prep?state=service` },
      { key: "kitchenOpen", href: `${BASE}/station/prep?state=open` },
      { key: "kitchenOffline", href: `${BASE}/station/prep?state=offline` },
      { key: "kitchenEmpty", href: `${BASE}/station/prep?state=nothingOpen` },
      { key: "counter", href: `${BASE}/station/till?state=service` },
    ],
  },
  {
    key: "menu",
    screens: [
      { key: "menu", href: `${BASE}/menu?state=service` },
      { key: "menuWorker", href: `${BASE}/menu?state=worker` },
      { key: "menuNoRoute", href: `${BASE}/menu?state=noRoute` },
      { key: "noMenu", href: `${BASE}/menu?state=noMenu` },
      { key: "categories", href: `${BASE}/menu/categories?state=service` },
      { key: "places", href: `${BASE}/menu/places?state=service` },
      { key: "noPlaces", href: `${BASE}/menu/places?state=noPlaces` },
      { key: "import", href: `${BASE}/menu/import?state=service` },
      {
        key: "importProblems",
        href: `${BASE}/menu/import?state=problems`,
      },
    ],
  },
] as const;

// The order-taking demo's list of screens (S0 of waiter mode, issue #191),
// for Orel to tap through, and the order a real waiter times against the
// pad (§3.4). Each link opens the demo afresh in that state. The menu's rows
// are the real screens since P2, and the floor's, the order's, "ההזמנות
// שלי" and preparing since P4, on the twin's rows, and the till since P5;
// the stations are still S0's (P8).
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

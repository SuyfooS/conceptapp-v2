import { BusinessList, BusinessSwitchRow } from "@ui/business-switcher";
import { cn } from "@ui/cn";
import { PageSection } from "@ui/page";
import type { Businesses } from "../businesses";
import { type AppWording, translator } from "../wording";

/**
 * The person's businesses on Home (payroll P3b), for someone in more than
 * one, on phones and tablets: the desktop switches from its sidebar, which
 * names the business. Nothing for anyone else.
 */
export function MyBusinesses({
  businesses,
  wording,
  className,
}: {
  businesses: Businesses | null | undefined;
  wording: AppWording;
  className?: string;
}) {
  if (!businesses) return null;
  const t = translator(wording, "ui.businesses");
  return (
    <div className={cn("min-w-0 xl:hidden", className)}>
      <PageSection title={t("title")}>
        <BusinessList businesses={businesses.list} action={businesses.action} />
      </PageSection>
    </div>
  );
}

/**
 * The same, on the profile: one row that opens the list in a sheet. Phones
 * and tablets only, as on Home.
 */
export function SwitchBusinessSection({
  businesses,
  wording,
}: {
  businesses: Businesses | null | undefined;
  wording: AppWording;
}) {
  if (!businesses) return null;
  const t = translator(wording, "ui.businesses");
  return (
    <PageSection title={t("title")} className="xl:hidden">
      <BusinessSwitchRow
        businesses={businesses.list}
        action={businesses.action}
      />
    </PageSection>
  );
}

import { PageSkeleton } from "@ui/skeleton";
import { useTranslations } from "next-intl";

/**
 * Shows the moment a tab is pressed, instead of the old screen standing still
 * until the new one's data arrives. A boundary above a shared segment doesn't
 * trigger, so the screens one level down each re-export this for moves inside
 * their own section.
 */
export default function Loading() {
  const t = useTranslations("app");
  return <PageSkeleton label={t("loading")} />;
}

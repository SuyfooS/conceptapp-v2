import { AppShellSkeleton } from "@ui/skeleton";
import { useTranslations } from "next-intl";

// What shows on a first load, before anyone is known.
export default function SkeletonDemo() {
  const t = useTranslations("app");
  return <AppShellSkeleton label={t("loading")} />;
}

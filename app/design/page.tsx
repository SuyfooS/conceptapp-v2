import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Gallery } from "./gallery";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("design");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

// Living reference for packages/ui: every component, in both directions,
// with any business accent. Check new components here before using them.
export default function DesignPage() {
  return <Gallery />;
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/** The station's own manifest (station/manifest.webmanifest/route.ts). */
const STATION_MANIFEST = "/station/manifest.webmanifest";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("station.manifest");
  return {
    // In the app's manifest's place: "Add to Home Screen" from here opens
    // the station, not Today.
    manifest: STATION_MANIFEST,
    robots: { index: false, follow: false },
    appleWebApp: {
      capable: true,
      title: t("shortName"),
      statusBarStyle: "default",
    },
  };
}

// A clock station (#78 phase 5): a device the business left out to show the
// clock's code, with nobody's account on it. Outside the app's frame, since
// nobody is signed in to have one.
export default function StationLayout({ children }: { children: ReactNode }) {
  return children;
}

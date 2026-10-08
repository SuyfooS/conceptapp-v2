import type { Metadata } from "next";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "מערכת העיצוב",
  robots: { index: false, follow: false },
};

// Living reference for packages/ui: every component, in both directions,
// with any business accent. Check new components here before using them.
export default function DesignPage() {
  return <Gallery />;
}

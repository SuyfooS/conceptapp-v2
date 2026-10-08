import type { Metadata, Viewport } from "next";
import "@fontsource-variable/heebo";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ConceptApp",
    template: "%s · ConceptApp",
  },
  description: "סידור עבודה, שעון נוכחות והזמנות מקומות למסעדות ובתי קפה.",
  applicationName: "ConceptApp",
};

export const viewport: Viewport = {
  themeColor: "#faf8f5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Hebrew and RTL by default. English (LTR) arrives with next-intl later;
// until then nothing in the UI may assume a direction — use logical
// utilities only (ps-/pe-, ms-/me-, start-/end-, text-start).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className="h-full">
      <body className="min-h-full bg-bg text-ink">{children}</body>
    </html>
  );
}

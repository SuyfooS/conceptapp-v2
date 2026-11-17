import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { defaultLocale } from "@/i18n/config";

/**
 * The station's own manifest, linked from its layout in the app's place: "Add
 * to Home Screen" on the station opens the station itself, in full screen,
 * either way up, with ConceptApp's icons (app/manifest.ts's). Its scope is
 * /station, so the app put on the same device's home screen stays its own.
 */
export async function GET(): Promise<Response> {
  const t = await getTranslations({
    locale: defaultLocale,
    namespace: "station.manifest",
  });
  const manifest: MetadataRoute.Manifest = {
    name: t("name"),
    short_name: t("shortName"),
    description: t("description"),
    id: "/station",
    start_url: "/station",
    scope: "/station",
    display: "fullscreen",
    orientation: "any",
    dir: "rtl",
    lang: "he",
    background_color: "#eeeff2",
    theme_color: "#eeeff2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}

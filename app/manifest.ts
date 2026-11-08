import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Install as an app (approved by Orel): what a phone needs to put ConceptApp
 * on the home screen and open it without the browser around it, straight to
 * Today. The colours are the page's, light, so the splash matches the first
 * screen; the icons are ConceptApp's mark in white on purple, full bleed, made
 * with the files in docs/brand.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations("metadata");
  return {
    name: "ConceptApp",
    short_name: "ConceptApp",
    description: t("description"),
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
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
}

import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { defaultLocale } from "@/i18n/config";

/** Which station's words: the clock's, a kitchen's screen's or the till's (waiter mode P8a). */
const kindOf = z.enum(["clock", "prep", "till"]).catch("clock");

/**
 * The station's own manifest, linked from its layout in the app's place: "Add
 * to Home Screen" on the station opens the station itself, in full screen,
 * either way up, with ConceptApp's icons (app/manifest.ts's). Its scope is
 * /station, so the app put on the same device's home screen stays its own.
 * A kitchen's screen and the till link it with `?kind=`, for their own name
 * on the home screen; the station it opens is the same either way.
 */
export async function GET(request: Request): Promise<Response> {
  const kind = kindOf.parse(new URL(request.url).searchParams.get("kind"));
  const t = await getTranslations({
    locale: defaultLocale,
    namespace: "station.manifest",
  });
  const words =
    kind === "clock"
      ? {
          name: t("name"),
          shortName: t("shortName"),
          description: t("description"),
        }
      : {
          name: t(`${kind}.name`),
          shortName: t(`${kind}.shortName`),
          description: t(`${kind}.description`),
        };
  const manifest: MetadataRoute.Manifest = {
    name: words.name,
    short_name: words.shortName,
    description: words.description,
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

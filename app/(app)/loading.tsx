import { PageSkeleton } from "@ui/skeleton";
import { baseWording, translator } from "./wording";

/**
 * Shows the moment a tab is pressed, instead of the old screen standing still
 * until the new one's data arrives. A boundary above a shared segment doesn't
 * trigger, so the screens one level down each re-export this for moves inside
 * their own section.
 */
export default function Loading() {
  // Before anyone is read: the app's own words.
  const t = translator(baseWording, "app");
  return <PageSkeleton label={t("loading")} />;
}

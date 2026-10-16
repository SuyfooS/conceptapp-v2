import type { ModuleKey, ModuleManifest } from "@domain/modules";
import { manifest as notifications } from "./notifications/manifest";
import { manifest as reservations } from "./reservations/manifest";
import { manifest as scheduling } from "./scheduling/manifest";
import { manifest as storefront } from "./storefront/manifest";
import { manifest as timeClock } from "./time_clock/manifest";

/**
 * Every module, in nav order. The app builds navigation, home cards and
 * module gates from this list and the business's `business_modules` rows;
 * no screen checks a module by hand.
 */
export const manifests = [
  scheduling,
  timeClock,
  reservations,
  storefront,
  notifications,
] as const satisfies readonly ModuleManifest[];

export type Manifests = typeof manifests;

export function manifestFor<Key extends ModuleKey>(
  key: Key,
): Extract<Manifests[number], { key: Key }> {
  const found = manifests.find((m) => m.key === key);
  if (!found) throw new Error(`No manifest for module ${key}`);
  return found as Extract<Manifests[number], { key: Key }>;
}

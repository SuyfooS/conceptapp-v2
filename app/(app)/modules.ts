import {
  enabledModules,
  type ModuleKey,
  type ModuleManifest,
  type ModuleRow,
  readModuleSettings,
} from "@domain/modules";
import { type Manifests, manifestFor, manifests } from "@modules/registry";
import { cache } from "react";
import type { z } from "zod";
import { currentMember } from "./member";

/** The business's module rows, which come with the member. */
const currentModuleRows = cache(
  async (): Promise<ModuleRow[]> =>
    (await currentMember())?.membership?.business.modules ?? [],
);

/**
 * The modules that are on for the signed-in person's business, read once
 * per request. Empty when they are not in a business.
 */
export const currentModules = cache(
  async (): Promise<ModuleKey[]> =>
    enabledModules(manifests, await currentModuleRows()),
);

type SettingsOf<Key extends ModuleKey> = z.output<
  Extract<Manifests[number], { key: Key }>["settings"]
>;

/** A module's settings for the business, defaults filling the gaps. */
export async function currentModuleSettings<Key extends ModuleKey>(
  key: Key,
): Promise<SettingsOf<Key>> {
  const row = (await currentModuleRows()).find((r) => r.key === key);
  const manifest: ModuleManifest = manifestFor(key);
  return readModuleSettings(manifest, row?.settings) as SettingsOf<Key>;
}

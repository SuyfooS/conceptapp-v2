"use server";

import { randomBytes } from "node:crypto";
import { NEW_BUSINESS_FIELDS, parseNewBusiness } from "@domain/business";
import { inviteLink } from "@domain/invites";
import { type ModuleManifest, moduleKeyOf } from "@domain/modules";
import { checkSettingsChange } from "@domain/settings-form";
import { checkSentence, type MessageTree, sentenceFits } from "@domain/wording";
import { manifestFor } from "@modules/registry";
import { redirect } from "next/navigation";
import { requestOrigin } from "@/app/origin";
import he from "@/messages/he.json";
import type { InviteLinkState } from "../../(admin)/admin/businesses/[slug]/actions";
import { formatsCleanly } from "../../(admin)/admin/businesses/[slug]/wording/formats";
import type { WordingSaveResult } from "../../(admin)/admin/businesses/[slug]/wording/wording-types";
import type { NewBusinessState } from "../../(admin)/admin/new/actions";
import type { SettingsResult } from "../../(app)/manage/settings-types";
import { demoWording } from "./data";

// Stand-ins for the console's actions on the design demo: the same checks, a
// link that leads nowhere, and nothing stored.

export async function demoSignOut(): Promise<void> {}

export async function demoViewAs(_form: FormData): Promise<void> {}

export async function demoSaveBusinessSettings(
  module: string,
  change: unknown,
): Promise<SettingsResult> {
  const key = moduleKeyOf(module);
  if (!key) return { ok: false, failure: "noAccess" };
  const manifest: ModuleManifest = manifestFor(key);
  const checked = checkSettingsChange(manifest, {}, change, "team");
  return checked.ok ? { ok: true } : { ok: false, failure: checked.problem };
}

export async function demoSetBusinessModule(
  _module: string,
  _enabled: boolean,
): Promise<SettingsResult> {
  return { ok: true };
}

export async function demoIssueLink(
  _inviteId: string,
  _prev: InviteLinkState,
  _form: FormData,
): Promise<InviteLinkState> {
  return {
    link: inviteLink(
      await requestOrigin(),
      randomBytes(32).toString("base64url"),
    ),
  };
}

export async function demoCreateBusiness(
  _prev: NewBusinessState,
  form: FormData,
): Promise<NewBusinessState> {
  const parsed = parseNewBusiness(
    Object.fromEntries(NEW_BUSINESS_FIELDS.map((f) => [f, form.get(f)])),
  );
  if (!parsed.ok) return { errors: parsed.errors };
  // Taken in the demo too, so the way back to the slug can be seen.
  if (parsed.value.slug === "demo-restaurant") {
    return { errors: { slug: "taken" } };
  }
  redirect("/design/console/businesses/cafe-noa");
}

/**
 * The wording editor's stand-in save: the same checks, and nothing stored.
 * The sentence is shown as saved until the page is opened again.
 */
export async function demoSaveWording(
  key: string,
  sentence: string | null,
): Promise<WordingSaveResult> {
  // What the demo business starts with: right for the first change to a
  // sentence, which is what the demo shows.
  const previous =
    (demoWording.business as Record<string, string>)[key] ?? null;
  if (sentence === null) return { ok: true, sentence: null, previous };
  const checked = checkSentence(he as MessageTree, key, sentence);
  if (!checked.ok) return { ok: false, problem: checked.problem };
  if (!formatsCleanly(checked.sentence)) {
    return { ok: false, problem: "syntax" };
  }
  const template =
    (demoWording.template as Record<string, string>)[key] ?? null;
  const below =
    template !== null && sentenceFits(checked.base, template)
      ? template
      : checked.base;
  return {
    ok: true,
    sentence: checked.sentence === below ? null : checked.sentence,
    previous,
  };
}

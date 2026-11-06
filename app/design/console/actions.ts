"use server";

import { randomBytes } from "node:crypto";
import { NEW_BUSINESS_FIELDS, parseNewBusiness } from "@domain/business";
import { inviteLink } from "@domain/invites";
import { redirect } from "next/navigation";
import { requestOrigin } from "@/app/origin";
import type { InviteLinkState } from "../../(admin)/admin/businesses/[slug]/actions";
import type { NewBusinessState } from "../../(admin)/admin/new/actions";

// Stand-ins for the console's actions on the design demo: the same checks, a
// link that leads nowhere, and nothing stored.

export async function demoSignOut(): Promise<void> {}

export async function demoViewAs(_form: FormData): Promise<void> {}

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

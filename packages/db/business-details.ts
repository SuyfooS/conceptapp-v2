import "server-only";
import type {
  BusinessDetails,
  BusinessDetailsPatch,
} from "@domain/business-details";
import { shabbatCityOf } from "@domain/shabbat";
import { type Written, written } from "./module-settings";
import { createAdminClient } from "./supabase/admin";

/*
 * A business's own details: its name, colour, address and Shabbat city. Writes
 * run with the secret key: the database checks who `actorId` is, and callers
 * check the change first (`checkBusinessDetailsChange`) and that the actor is the
 * signed-in person.
 */

/** Saves some of the details; the rest stay as they are. */
export async function setBusinessDetails(
  actorId: string,
  businessId: string,
  patch: BusinessDetailsPatch,
): Promise<Written> {
  const { shabbatCity, ...rest } = patch;
  const { error } = await createAdminClient().rpc("set_business_details", {
    actor: actorId,
    business: businessId,
    // The database names the city by its column.
    patch:
      shabbatCity === undefined ? rest : { ...rest, shabbat_city: shabbatCity },
  });
  return written(error);
}

/**
 * A business's details for the console, whose people aren't members of it, so
 * RLS has nothing to show them. Callers check they're on the team.
 */
export async function getBusinessDetailsForTeam(
  businessId: string,
): Promise<{ details: BusinessDetails; timeZone: string } | null> {
  const { data, error } = await createAdminClient()
    .from("businesses")
    .select("name, accent, address, shabbat_city, timezone")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    details: {
      name: data.name,
      accent: data.accent,
      address: data.address,
      shabbatCity: shabbatCityOf(data.shabbat_city),
    },
    timeZone: data.timezone,
  };
}

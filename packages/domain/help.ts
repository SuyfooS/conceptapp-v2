import {
  type AskFix,
  askFixOf,
  type ClockEditor,
  type HoursFixer,
  hoursFixers,
} from "./ask-fix";
import type { Department } from "./departments";
import type { Role } from "./modules";

/*
 * "עזרה" on /me (closing the pilot, PR 15): whom someone asks about the app
 * or their work. In the business, with the clock's own choice (PR 8,
 * @domain/ask-fix), since the app has no department manager: a worker asks
 * whoever may edit the clock, those in their departments first, else an
 * owner; anyone else asks an owner. Owners, managers and the accountant also
 * reach ConceptApp's team on WhatsApp, where the deployment names its number
 * (`SUPPORT_WHATSAPP`, @db/env), outside a demo business. Nothing is sent
 * from here: the chat or WhatsApp opens, and the person writes.
 */

/**
 * The roles that also reach ConceptApp's team: whoever runs the business,
 * and its accountant. A worker asks in the business.
 */
export const TEAM_HELP_ROLES = [
  "owner",
  "manager",
  "accountant",
] as const satisfies readonly Role[];

/**
 * Whom the person is offered to ask in the business, in the order offered,
 * as `hoursFixers` gives them (never the person themself, those in their
 * live departments first, each group by name; written to in chat where it
 * is open to the person, else named, and someone neither left out).
 *
 * - A worker: whoever may edit the clock (`editors`, as
 *   `public.clock_editors` answers it), the owners only when nobody else
 *   may, as PR 8 offers them for hours. Where the database names nobody (the
 *   clock is off for the business, or that read isn't in the project yet),
 *   the business's owners: in a business of any kind they hold every
 *   permission, whatever its roles hold.
 * - Anyone else (a manager, the accountant, an owner): the owners, never
 *   themself. A manager asks above them, not another manager or a worker
 *   who may edit the clock, and an owner alone in the business asks nobody
 *   here (ConceptApp's team is theirs).
 */
export function helpers({
  role,
  person,
  editors,
  owners,
  departments,
  chat,
}: {
  role: Role;
  /** The person asking, never offered to themself. */
  person: string;
  /** Who may edit the clock in the business; none while it is off. */
  editors: readonly ClockEditor[];
  /** The business's active owners, as every member reads them. */
  owners: readonly ClockEditor[];
  /** The business's departments, removed ones too (`getDepartments`). */
  departments: readonly Department[];
  /** Chat is open to the person (its module, and they are on the staff). */
  chat: boolean;
}): HoursFixer[] {
  const onlyOwners = owners.filter((owner) => owner.role === "owner");
  const among = role === "worker" && editors.length > 0 ? editors : onlyOwners;
  return hoursFixers({ editors: among, person, departments, chat });
}

/**
 * What "עזרה" offers: whom to ask in the business (`askFixOf`: one to
 * write to, several to pick from, or only their names), or none; and
 * whether ConceptApp's team on WhatsApp is there too, with its hours.
 */
export type Help<P extends HoursFixer = HoursFixer> = {
  ask: AskFix<P> | null;
  team: boolean;
};

/**
 * What "עזרה" offers the person, or null for no row at all: nothing while
 * the ConceptApp team views the business as someone; ConceptApp's team for
 * an owner, a manager or the accountant (`TEAM_HELP_ROLES`) only where the
 * deployment names its number (`support`) and never in a demo business,
 * whose door anyone may come in at as anyone, as no number or push reaches
 * out of one; whom to ask in the business otherwise as `fixers` say
 * (`helpers`), demo businesses too, whose chat stays inside the demo.
 */
export function helpOf<P extends HoursFixer>({
  fixers,
  role,
  viewing,
  demo,
  support,
}: {
  /** Whom to ask in the business (`helpers`), each with what the screen needs. */
  fixers: readonly P[];
  role: Role;
  /** The ConceptApp team views the business as someone. */
  viewing: boolean;
  /** A demo business (`isDemoBusiness`). */
  demo: boolean;
  /** The deployment names ConceptApp's WhatsApp (`SUPPORT_WHATSAPP`). */
  support: boolean;
}): Help<P> | null {
  if (viewing) return null;
  const ask = askFixOf(fixers);
  const team =
    support && !demo && (TEAM_HELP_ROLES as readonly Role[]).includes(role);
  return ask || team ? { ask, team } : null;
}

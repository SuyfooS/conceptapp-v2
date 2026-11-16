"use client";

import type { Role } from "@domain/modules";
import type { AddressForm } from "@domain/profile";
import { type LeftCounts, leavesStaff, roleChangeClears } from "@domain/team";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { Clock, UserMinus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { UndoRow } from "../../manage/undo-row";
import { HOLD_MS, useHeldWrite } from "../../use-held-write";
import type {
  MemberChangeActions,
  MemberChangeResult,
  TeamChangeActionFailure,
} from "../team-change-types";
import { markTeamChanged } from "../team-freshness";

/** What the person's page knows to change their place on the team. */
export type MemberChangesData = {
  personId: string;
  /** Their name as the page shows it, or the words for none. */
  name: string;
  /** Their first name, for the sentences that address them. */
  first: string;
  /** How the app writes about them, for the ICU `select`s. */
  form: AddressForm;
  role: Role;
  /**
   * The roles the viewer gives (`invitableRoles`), the person's own among
   * them: only these can they change the person from and to.
   */
  roles: Role[];
  /**
   * The roles only an owner gives here (`ownerOnlyRoles`: those that hold
   * pay), for a viewer who isn't one: shown in the sheet but not offered,
   * and a change away from one is held for its undo, as changing back would
   * be refused.
   */
  ownerOnly: Role[];
  /** Their shifts still to start, in published weeks and in drafts. */
  ahead: Pick<LeftCounts, "shifts" | "drafts">;
  /**
   * On the clock now: they can't leave the team or the staff until they
   * clock out. Null when the viewer doesn't read the team's hours: the page
   * then says so before the change, which the database refuses meanwhile.
   */
  clockedIn: boolean | null;
  /** Their hours on the clock, said while they are clocked in. */
  clockHref: string | null;
  /** Where the screen leads once they are off the team. */
  teamHref: string;
  scheduleHref: string;
};

/** What is held for its undo: their removal, or a role change that clears. */
type Held = { kind: "remove" } | { kind: "role"; from: Role; to: Role };

/**
 * on: on the team as the screen shows them; sending: their removal is on its
 * way, past undoing; removed: off the team, with what came off them.
 */
type Phase = "on" | "sending" | "removed";

type Undo = { message: string; run: () => void };

type ChangesValue = {
  data: MemberChangesData;
  /** Their role as the screen shows it, a held change included. */
  role: Role;
  phase: Phase;
  left: LeftCounts | null;
  failure: TeamChangeActionFailure | null;
  /** A removal waits for its undo. */
  removing: boolean;
  /** Something waits for its undo: the role row waits too. */
  holding: boolean;
  /** The undo of a role change, written or held. */
  roleUndo: Undo | null;
  busy: boolean;
  choose: (to: Role) => Promise<boolean>;
  remove: () => void;
  undoRemoval: () => void;
  toast: { text: string; stamp: string } | null;
};

const ChangesContext = createContext<ChangesValue | null>(null);

const settle = (run: Promise<MemberChangeResult>) =>
  run.catch(() => ({ ok: false, failure: "failed" }) as const);

/**
 * Taking someone off the team and changing their role, on their page, for an
 * editor of the team who may (Orel, 14 November 2026: whoever invites to a
 * role removes from it and changes to it). Removing hides what the page
 * offers at once and holds the write for "ביטול", as the access screen holds
 * a removal (`useHeldWrite`); once written, the page says what came off them
 * and leads back to the team. A role change that changing back can't undo
 * (`roleChangeClears`: leaving the staff, or becoming an owner; or, for
 * someone other than an owner, leaving a role that holds pay, which only an
 * owner gives back) is held the same way; any other is written at once, and
 * its undo is the change back.
 * The parts below read this state; without it they draw nothing.
 */
export function MemberChangesState({
  data,
  actions,
  children,
}: {
  data: MemberChangesData;
  actions: MemberChangeActions;
  children: ReactNode;
}) {
  const t = useTranslations("app.team.changes");
  const tRoles = useTranslations("app.team.roles");
  // The role as the server has it, and as the screen shows it.
  const [seen, setSeen] = useState(data.role);
  const [role, setRole] = useState(data.role);
  if (data.role !== seen) {
    setSeen(data.role);
    setRole(data.role);
  }
  const [phase, setPhase] = useState<Phase>("on");
  const [left, setLeft] = useState<LeftCounts | null>(null);
  const [failure, setFailure] = useState<TeamChangeActionFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [roleUndo, setRoleUndo] = useState<Undo | null>(null);
  const undoTimer = useRef<number | null>(null);
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );

  const roleName = (r: Role) => tRoles(r);

  function clearUndo() {
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setRoleUndo(null);
  }
  function showUndo(next: Undo) {
    clearUndo();
    setRoleUndo(next);
    undoTimer.current = window.setTimeout(() => {
      undoTimer.current = null;
      setRoleUndo((now) => (now === next ? null : now));
    }, HOLD_MS);
  }

  const held = useHeldWrite<Held>(async (value) => {
    if (value.kind === "remove") {
      setPhase("sending");
      const result = await settle(actions.remove(data.personId));
      if (result.ok) {
        // Nothing was revalidated, so this page keeps the card below; the
        // Team screen reads its list again when shown next.
        markTeamChanged();
        setLeft(result.left);
        setPhase("removed");
      } else {
        setPhase("on");
        setFailure(result.failure);
      }
      return;
    }
    // Sent: its undo goes with it.
    setRoleUndo(null);
    const result = await settle(
      actions.setRole(data.personId, value.to, value.from),
    );
    if (!result.ok) {
      setRole(value.from);
      setFailure(result.failure);
    }
  });

  /**
   * Gives them `to`: held for its undo when changing back can't undo it,
   * else written now with the change back as its undo. Whether the sheet
   * may close.
   */
  async function choose(to: Role): Promise<boolean> {
    const from = role;
    if (to === from || busy) return to === from;
    setFailure(null);
    clearUndo();
    // Changing back to a role that holds pay is an owner's: its undo only
    // keeps the write from going.
    if (roleChangeClears(from, to) || data.ownerOnly.includes(from)) {
      setRole(to);
      held.hold({ kind: "role", from, to });
      setRoleUndo({
        message: t("roleChanged", { name: data.name, role: roleName(to) }),
        run: () => {
          if (held.release()) setRole(from);
          setRoleUndo(null);
        },
      });
      return true;
    }
    setBusy(true);
    const result = await settle(actions.setRole(data.personId, to, from));
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return false;
    }
    setRole(to);
    showUndo({
      message: t("roleChanged", { name: data.name, role: roleName(to) }),
      run: () => void changeBack(from, to),
    });
    return true;
  }

  /** The undo of a role change already written: the change back. */
  async function changeBack(from: Role, to: Role) {
    clearUndo();
    setRole(from);
    const result = await settle(actions.setRole(data.personId, from, to));
    if (!result.ok) {
      setRole(to);
      setFailure(result.failure);
      return;
    }
    setToast({
      text: t("roleBack", { name: data.name, role: roleName(from) }),
      stamp: new Date().toISOString(),
    });
  }

  function remove() {
    if (phase !== "on") return;
    setFailure(null);
    clearUndo();
    held.hold({ kind: "remove" });
  }

  function undoRemoval() {
    const value = held.release();
    if (value?.kind !== "remove") return;
    setPhase("on");
  }

  // Leaving the screen: the held write goes (`useHeldWrite`), and the undo
  // of a written change with it, so none comes back that can't undo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on leaving
  useLayoutEffect(() => () => clearUndo(), []);

  const removing = held.held?.kind === "remove";
  return (
    <ChangesContext
      value={{
        data,
        role,
        phase,
        left,
        failure,
        removing,
        holding: held.held !== null,
        roleUndo,
        busy,
        choose,
        remove,
        undoRemoval,
        toast,
      }}
    >
      {children}
    </ChangesContext>
  );
}

/** What the page offers while the person is on the team; nothing once off it. */
export function WhileOnTeam({ children }: { children: ReactNode }) {
  const value = use(ChangesContext);
  if (value && (value.removing || value.phase !== "on")) return null;
  return children;
}

/** "תפקיד" with their role, which opens the sheet to change it. */
export function MemberRoleRow() {
  const value = use(ChangesContext);
  const t = useTranslations("app.team.changes");
  const tRoles = useTranslations("app.team.roles");
  const [open, setOpen] = useState(false);
  if (!value || value.data.roles.length < 2) return null;
  const { role, holding, roleUndo, toast } = value;
  return (
    <div className="flex flex-col gap-2">
      <StatusToast message={toast?.text ?? null} stamp={toast?.stamp} />
      <ListGroup>
        <ListRow
          title={t("role")}
          trailing={<span className="text-ink-2">{tRoles(role)}</span>}
          disabled={holding}
          onClick={() => setOpen(true)}
        />
      </ListGroup>
      {roleUndo ? (
        <UndoRow message={roleUndo.message} onUndo={roleUndo.run} />
      ) : null}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("roleSheet", { name: value.data.first })}
        closeLabel={t("close")}
      >
        {/* Mounted on each opening, so it starts from the role they have. */}
        <RoleChoice value={value} onDone={() => setOpen(false)} />
      </Sheet>
    </div>
  );
}

function RoleChoice({
  value,
  onDone,
}: {
  value: ChangesValue;
  onDone: () => void;
}) {
  const t = useTranslations("app.team.changes");
  const tRoles = useTranslations("app.team.roles");
  const tHints = useTranslations("app.team.invite.roleHint");
  const { data, role, busy, failure } = value;
  const [draft, setDraft] = useState<Role>(role);
  const [tried, setTried] = useState(false);
  const ahead = data.ahead.shifts + data.ahead.drafts;
  // Off the staff, they could not clock out.
  const clockBlocked = (r: Role) =>
    data.clockedIn === true && leavesStaff(role, r);
  // A role that holds pay is an owner's to give (their own one stays theirs).
  const payBlocked = (r: Role) => r !== role && data.ownerOnly.includes(r);
  const blocked = (r: Role) => clockBlocked(r) || payBlocked(r);

  async function save() {
    setTried(true);
    if (await value.choose(draft)) onDone();
  }

  return (
    <div className="flex flex-col gap-4 px-2 pt-2 pb-1">
      <ChoiceList
        legend={t("roleSheet", { name: data.first })}
        legendClassName="sr-only"
      >
        {data.roles.map((r) => (
          <ChoiceRow
            key={r}
            name="member-role"
            value={r}
            checked={draft === r}
            disabled={blocked(r)}
            className={blocked(r) ? "opacity-60" : undefined}
            onChange={() => {
              setDraft(r);
              setTried(false);
            }}
            title={tRoles(r)}
            hint={
              payBlocked(r)
                ? t("payHint")
                : clockBlocked(r)
                  ? t("clockedInHint")
                  : tHints(r)
            }
          />
        ))}
      </ChoiceList>
      {leavesStaff(role, draft) ? (
        <p className="px-2 text-pretty text-base text-ink-2">
          {t("accountantNote", { count: ahead })}
          {data.clockedIn === null
            ? ` ${t("clockUnknown", { name: data.first })}`
            : null}
        </p>
      ) : draft === "owner" && role !== "owner" ? (
        <p className="px-2 text-pretty text-base text-ink-2">
          {t("ownerNote")}
        </p>
      ) : null}
      {tried && failure ? (
        <p role="alert" className="text-center text-base text-danger">
          {t(`failures.${failure}`)}
        </p>
      ) : null}
      <Button
        size="lg"
        loading={busy}
        disabled={draft === role}
        onClick={save}
        className="w-full"
      >
        {t("roleSubmit")}
      </Button>
    </div>
  );
}

/**
 * "הסרה מהצוות", centred and red in a group of its own, with what it does;
 * while they are clocked in, why not yet and their hours instead. Under it,
 * why the last change was not made.
 */
export function MemberRemoval() {
  const value = use(ChangesContext);
  const t = useTranslations("app.team.changes");
  if (!value) return null;
  const { data, failure } = value;
  const ahead = data.ahead.shifts + data.ahead.drafts;
  return (
    <div className="flex flex-col gap-2">
      {data.clockedIn ? (
        <>
          <p className="px-1 text-base text-ink-2">
            {t("clockedIn", { name: data.first })}
          </p>
          {data.clockHref ? (
            <ListGroup>
              <ListRow
                href={data.clockHref}
                leading={<Clock />}
                title={t("clockedInLink", { name: data.first })}
              />
            </ListGroup>
          ) : null}
        </>
      ) : (
        <>
          <ListGroup>
            <button
              type="button"
              onClick={value.remove}
              className="flex min-h-[3.25rem] w-full items-center justify-center gap-2 px-4 font-medium text-danger transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&_svg]:size-5"
            >
              <UserMinus aria-hidden="true" />
              {t("remove")}
            </button>
          </ListGroup>
          <p className="px-1 text-pretty text-ink-2 text-sm">
            {t("removeHint", { name: data.first, form: data.form })}
            {ahead > 0 ? ` ${t("removeShifts", { count: ahead })}` : null}
            {/* Whether they are on the clock isn't the viewer's to read. */}
            {data.clockedIn === null
              ? ` ${t("clockUnknown", { name: data.first })}`
              : null}
          </p>
        </>
      )}
      {failure ? (
        <p role="alert" className="px-1 text-base text-danger">
          {t(`failures.${failure}`)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Where the page's offers were, once the person is going: the removal with
 * "ביטול" while it waits, then, written, that they are off the team, how many
 * shifts now lack someone, the swap requests on them cancelled and those
 * they had taken open to others again, and the way back to the team.
 */
export function MemberLeft() {
  const value = use(ChangesContext);
  const t = useTranslations("app.team.changes");
  if (!value) return null;
  const { data, phase, left, removing } = value;
  const removed = t("removed", { name: data.name, form: data.form });
  if (removing) {
    return <UndoRow message={removed} onUndo={value.undoRemoval} />;
  }
  if (phase === "sending") {
    return (
      <p role="status" className="px-1 text-base text-ink-2">
        {removed}
      </p>
    );
  }
  if (phase !== "removed" || !left) return null;
  return (
    <Card tone="flat" padding="lg" className="flex flex-col gap-3">
      <CardTitle as="h2" className="text-lg">
        {t("removedTitle", { name: data.name })}
      </CardTitle>
      <div className="flex flex-col gap-1">
        <CardText>{t("removedShifts", { count: left.shifts })}</CardText>
        {left.drafts > 0 ? (
          <CardText>{t("removedDrafts", { count: left.drafts })}</CardText>
        ) : null}
        {left.swaps > 0 ? (
          <CardText>{t("removedSwaps", { count: left.swaps })}</CardText>
        ) : null}
        {left.reopened > 0 ? (
          <CardText>
            {t("removedReopened", { count: left.reopened, name: data.name })}
          </CardText>
        ) : null}
        <CardText>{t("removedKept")}</CardText>
      </div>
      <div className="mt-1 flex flex-col gap-2 md:flex-row">
        <Button asChild size="lg">
          <Link href={data.teamHref}>{t("backToTeam")}</Link>
        </Button>
        {left.shifts + left.drafts > 0 ? (
          <Button asChild size="lg" variant="secondary">
            <Link href={data.scheduleHref}>{t("toSchedule")}</Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

"use client";

import {
  type ImportRoles,
  type KnownTeam,
  WAITING_INVITES_MAX,
} from "@domain/people-import";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { ImportMode } from "../../../../(app)/team/import/import-lines";
import type {
  ImportPeople,
  UndoPeopleImport,
} from "../../../../(app)/team/import/import-types";
import {
  PeopleImportView,
  type PeopleImportViewProps,
} from "../../../../(app)/team/import/import-view";

/** A moment, as a real import takes one: the press shows it is on its way. */
const WAIT_MS = 250;
const wait = () => new Promise((done) => setTimeout(done, WAIT_MS));

/**
 * The real import screen with stand-ins for its actions, on the device
 * only: nothing pasted leaves the browser, and nothing is written anywhere,
 * so whoever pastes a real list on the hosted demo sends nobody anything.
 * An import answers as the database would for the twin's team: a number
 * with an invite still unsent, the twin's or one an import made, is
 * updated, any other is made. Taking it back cancels what it made, so an
 * import that goes before the undo of the last finds those still waiting.
 * `fail` makes the import, or its taking back, refuse as a real one may
 * (`open`: the business has too many invites waiting).
 * The console's twin (`mode="console"`) also names the numbers on another
 * business's staff (`elsewhere`): a list holding one is refused as the
 * console's database refuses it, by the rows' places. The Team twin's done
 * screen sends links with the Team twin's stand-in (`send`), WhatsApp to
 * nobody: the people pasted may be real, and their numbers stay here.
 */
export function ImportTwin({
  mode = "team",
  roles,
  known,
  initialPaste,
  startAt,
  fail,
  paths,
  elsewhere = [],
  send,
}: {
  mode?: ImportMode;
  roles: ImportRoles;
  known: KnownTeam;
  initialPaste: string;
  startAt?: PeopleImportViewProps["startAt"];
  fail?: "import" | "undo" | "open";
  /** Where the screen goes back to: the Team twin's, unless given. */
  paths?: PeopleImportViewProps["paths"];
  /** The console's: numbers on another of the twin's businesses' staff. */
  elsewhere?: readonly string[];
  /** The Team twin's send list after an import: never to a number. */
  send?: PeopleImportViewProps["send"];
}) {
  const t = useTranslations("app.team.import");
  /**
   * The invites waiting with no link yet, by number, kept as the database
   * keeps them: each one's id stays as it is updated, so a link made for it
   * after one import is the same after the next.
   */
  const [unsent] = useState(
    () =>
      new Map(
        known.invites
          .filter((invite) => invite.linkPending)
          .map((invite) => [invite.phone, invite.id]),
      ),
  );
  /** What each import made, by its id, for its undo to cancel. */
  const [made] = useState(() => new Map<string, string[]>());
  const imports = useRef(0);
  /** The invites made so far: each new one's id is its own, never a number. */
  const invites = useRef(0);
  const importPeople: ImportPeople = async (people) => {
    await wait();
    if (fail === "import") return { ok: false, failure: "failed" };
    if (fail === "open") {
      return { ok: false, failure: "tooManyOpen", open: WAITING_INVITES_MAX };
    }
    const far = people.flatMap((person, index) =>
      elsewhere.includes(person.phone) ? [index + 1] : [],
    );
    if (far.length > 0) return { ok: false, failure: "elsewhere", rows: far };
    const phones: string[] = [];
    const rows = people.map((person, index) => {
      const waiting = unsent.get(person.phone);
      if (waiting !== undefined) {
        return { i: index + 1, status: "updated" as const, invite: waiting };
      }
      invites.current += 1;
      const invite = `twin-invite-${invites.current}`;
      unsent.set(person.phone, invite);
      phones.push(person.phone);
      return { i: index + 1, status: "created" as const, invite };
    });
    if (phones.length === 0) return { ok: true, importId: null, rows };
    imports.current += 1;
    const importId = `twin-import-${imports.current}`;
    made.set(importId, phones);
    return { ok: true, importId, rows };
  };
  const undoImport: UndoPeopleImport = async (importId) => {
    await wait();
    if (fail === "undo") return { ok: false, failure: "failed" };
    const phones = made.get(importId) ?? [];
    made.delete(importId);
    for (const phone of phones) unsent.delete(phone);
    return { ok: true, cancelled: phones.length, kept: 0 };
  };
  return (
    <PeopleImportView
      mode={mode}
      roles={roles}
      known={known}
      importPeople={importPeople}
      undoImport={undoImport}
      paths={
        paths ?? {
          back: { href: "/design/shell/team", label: t("back") },
          done: { href: "/design/shell/team", label: t("done.toTeam") },
        }
      }
      initialPaste={initialPaste}
      startAt={startAt}
      send={send}
    />
  );
}

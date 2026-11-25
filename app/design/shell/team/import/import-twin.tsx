"use client";

import type { ImportRoles, KnownTeam } from "@domain/people-import";
import { useTranslations } from "next-intl";
import { useRef } from "react";
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
 * with an invite still unsent is updated, any other is made. Taking it back
 * cancels what it made.
 */
export function ImportTwin({
  roles,
  known,
  initialPaste,
  startAt,
}: {
  roles: ImportRoles;
  known: KnownTeam;
  initialPaste: string;
  startAt?: PeopleImportViewProps["startAt"];
}) {
  const t = useTranslations("app.team.import");
  /** What the last import made, for its undo to cancel. */
  const made = useRef(0);
  const importPeople: ImportPeople = async (people) => {
    await wait();
    const waiting = new Set(
      known.invites
        .filter((invite) => invite.linkPending)
        .map((invite) => invite.phone),
    );
    const rows = people.map((person, index) => ({
      i: index + 1,
      status: waiting.has(person.phone)
        ? ("updated" as const)
        : ("created" as const),
      invite: `twin-${index + 1}`,
    }));
    made.current = rows.filter((row) => row.status === "created").length;
    return {
      ok: true,
      importId: made.current > 0 ? "twin-import" : null,
      rows,
    };
  };
  const undoImport: UndoPeopleImport = async () => {
    await wait();
    return { ok: true, cancelled: made.current, kept: 0 };
  };
  return (
    <PeopleImportView
      roles={roles}
      known={known}
      importPeople={importPeople}
      undoImport={undoImport}
      paths={{
        back: { href: "/design/shell/team", label: t("back") },
        done: { href: "/design/shell/team", label: t("done.toTeam") },
      }}
      initialPaste={initialPaste}
      startAt={startAt}
    />
  );
}

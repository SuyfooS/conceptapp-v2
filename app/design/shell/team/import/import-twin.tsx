"use client";

import type { ImportRoles, KnownTeam } from "@domain/people-import";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
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
 * `fail` makes the import, or its taking back, refuse as a real one may.
 */
export function ImportTwin({
  roles,
  known,
  initialPaste,
  startAt,
  fail,
}: {
  roles: ImportRoles;
  known: KnownTeam;
  initialPaste: string;
  startAt?: PeopleImportViewProps["startAt"];
  fail?: "import" | "undo";
}) {
  const t = useTranslations("app.team.import");
  /** The numbers whose invite waits with no link yet, kept as the database keeps them. */
  const [unsent] = useState(
    () =>
      new Set(
        known.invites
          .filter((invite) => invite.linkPending)
          .map((invite) => invite.phone),
      ),
  );
  /** What each import made, by its id, for its undo to cancel. */
  const [made] = useState(() => new Map<string, string[]>());
  const imports = useRef(0);
  const importPeople: ImportPeople = async (people) => {
    await wait();
    if (fail === "import") return { ok: false, failure: "failed" };
    const rows = people.map((person, index) => ({
      i: index + 1,
      status: unsent.has(person.phone)
        ? ("updated" as const)
        : ("created" as const),
      invite: `twin-${index + 1}`,
    }));
    const phones = people
      .filter((person) => !unsent.has(person.phone))
      .map((person) => person.phone);
    if (phones.length === 0) return { ok: true, importId: null, rows };
    for (const phone of phones) unsent.add(phone);
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

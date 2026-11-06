"use client";

import { DEMO_PEOPLE } from "@domain/passive-sign-in";
import { ListGroup, ListRow } from "@ui/list-row";
import { PersonAvatar } from "@ui/person-row";
import { Spinner } from "@ui/spinner";
import { unstable_rethrow } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { authFieldsClass } from "../auth-screen";
import type { EnterResult } from "./actions";

/** One press on a person, and they are in. */
export function EnterForm({
  enter,
}: {
  /** `enterAs`, or the design demo's stand-in. */
  enter: (person: string) => Promise<EnterResult>;
}) {
  const t = useTranslations("auth.enter");
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function choose(person: string) {
    if (pending) return;
    setChosen(person);
    setFailed(false);
    start(async () => {
      try {
        // Success leaves this screen: the action redirects.
        await enter(person);
        setFailed(true);
      } catch (error) {
        unstable_rethrow(error);
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-ink-2">{t("intro")}</p>
      <ListGroup className={authFieldsClass}>
        {DEMO_PEOPLE.map((person) => (
          <ListRow
            key={person}
            onClick={() => choose(person)}
            leading={<PersonAvatar name={t(`people.${person}.name`)} />}
            title={t(`people.${person}.name`)}
            subtitle={t(`people.${person}.role`)}
            trailing={pending && chosen === person ? <Spinner /> : null}
          />
        ))}
      </ListGroup>
      {failed ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t("failed")}
        </p>
      ) : null}
      <p className="px-1 text-ink-2 text-sm">{t("warning")}</p>
    </div>
  );
}

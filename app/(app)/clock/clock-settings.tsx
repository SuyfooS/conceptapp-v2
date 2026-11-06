"use client";

import { Button } from "@ui/button";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { ClockActionResult } from "./clock-types";

/**
 * For owners and managers: whether a break comes off the hours. It stays here
 * until the management page arrives.
 */
export function ClockSettings({
  unpaidBreaks,
  viewOnly,
  save,
}: {
  unpaidBreaks: boolean;
  viewOnly: boolean;
  save: (unpaidBreaks: boolean) => Promise<ClockActionResult>;
}) {
  const t = useTranslations("app.clock");
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(unpaidBreaks);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  function show() {
    setChoice(unpaidBreaks);
    setFailed(false);
    setOpen(true);
  }

  function submit() {
    setFailed(false);
    start(async () => {
      try {
        const result = await save(choice);
        if (result.ok) setOpen(false);
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <>
      <ListGroup>
        <ListRow
          onClick={show}
          title={t("settings.row")}
          subtitle={t(unpaidBreaks ? "settings.unpaid" : "settings.paid")}
        />
      </ListGroup>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        closeLabel={t("settings.close")}
      >
        <div className="flex flex-col gap-4">
          <ChoiceList legend={t("settings.row")} legendClassName="sr-only">
            <ChoiceRow
              name="unpaidBreaks"
              checked={!choice}
              onChange={() => setChoice(false)}
              title={t("settings.paid")}
              hint={t("settings.paidHint")}
            />
            <ChoiceRow
              name="unpaidBreaks"
              checked={choice}
              onChange={() => setChoice(true)}
              title={t("settings.unpaid")}
              hint={t("settings.unpaidHint")}
            />
          </ChoiceList>
          {failed ? (
            <p role="alert" className="font-medium text-danger">
              {t("settings.failed")}
            </p>
          ) : null}
          {viewOnly ? (
            <p className="text-ink-2 text-sm">{t("settings.viewOnly")}</p>
          ) : null}
          <Button
            size="lg"
            loading={pending}
            disabled={viewOnly}
            onClick={submit}
          >
            {t("settings.save")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

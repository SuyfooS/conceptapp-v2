"use client";

import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { UndoRow } from "@ui/undo-row";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { FileToday, FileTodayActions } from "../me/file/file-types";
import { useHeldWrite } from "../use-held-write";
import { sendHide } from "./hide-request";

/**
 * The account for wages changed (profile H5b, issue #82 §3.1): for 14 days
 * after a change, Today says when, on a quiet card, so someone whose phone
 * was taken over hears of it where they look every day. "לא שיניתי" marks
 * the account for the owner and the accountant to look at, at once (no
 * undo: it destroys nothing, and they clear it), and the card says what
 * follows, with "הבנתי"; its focus goes to the card's title, since the
 * button it was on goes. "אני שיניתי" and "הבנתי" hide the card the way the
 * first steps hide (`FirstStepsHides`): it goes at once, "ביטול" takes its
 * place with the focus, and the write is held for it (`useHeldWrite`),
 * sent through a route (`actions.seenUrl`, /home/bank-seen) since a held
 * action loses its cookie. "ביטול" brings the card back with the focus on
 * the button pressed. Hidden is kept on this device only, and only for the
 * change the card was drawn for (`bank.changedAt`, the database's moment):
 * when the account changed again meanwhile, nothing is kept and Today,
 * drawn again, tells the newer change (Today keys the card by it, so it
 * comes back whole). Another phone tells it all the same, and the bank
 * step on /me/file keeps "לא שיניתי" for the 14 days, on this one too
 * (only a change made on a device isn't asked there). A refusal keeps the
 * card, or brings it back, and says so beside its buttons.
 */
export function BankChangeCard({
  bank,
  business,
  businessId,
  actions,
}: {
  bank: NonNullable<FileToday["bank"]>;
  /** The business's name, as the card says it. */
  business: string;
  /** The business the card was drawn for: the hide is sent for it. */
  businessId: string;
  actions: FileTodayActions;
}) {
  const t = useTranslations("app.home.file.bank");
  const format = useFormatter();
  const router = useRouter();
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const hideButton = useRef<HTMLButtonElement>(null);
  const backToButton = useRef(false);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);
  // Today is on screen: not once it is left, while Next keeps it for the way
  // back, so a hide sent on leaving never draws the next screen again.
  const shown = useRef(false);
  useLayoutEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  // Drawn again as disputed after "לא שיניתי": the keyboard goes on from
  // the title.
  const disputed = bank.disputed;
  const wasDisputed = useRef(disputed);
  useEffect(() => {
    if (disputed && !wasDisputed.current) {
      title.current?.focus({ preventScroll: true });
    }
    wasDisputed.current = disputed;
  }, [disputed]);

  // Kept seen for this very change. A newer one (409) is no failure: Today,
  // drawn again, tells it.
  const held = useHeldWrite<true>(async () => {
    const answer = await sendHide(actions.seenUrl, {
      business: businessId,
      changedAt: bank.changedAt,
    });
    if (answer?.ok || answer?.status === 409) {
      if (shown.current) router.refresh();
    } else {
      setGone(false);
      setFailed(true);
    }
  });

  // Back from "ביטול", the keyboard goes where it was.
  useEffect(() => {
    if (!gone && backToButton.current) {
      backToButton.current = false;
      hideButton.current?.focus();
    }
  }, [gone]);

  function hide() {
    setFailed(false);
    setGone(true);
    held.hold(true);
  }

  function undo() {
    held.release();
    backToButton.current = true;
    setGone(false);
  }

  function dispute() {
    setFailed(false);
    start(async () => {
      const answer = await actions
        .dispute()
        .catch(() => ({ ok: false, failure: "failed" }) as const);
      if (!answer.ok) setFailed(true);
      else if (answer.to) router.push(answer.to, { scroll: false });
    });
  }

  if (gone) {
    // Once written, Today is drawn again without the card.
    return held.held ? (
      <div className="md:max-w-2xl">
        <UndoRow message={t("hidden")} onUndo={undo} autoFocus />
      </div>
    ) : null;
  }

  const date = format.dateTime(new Date(`${bank.on}T12:00:00Z`), {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <section aria-labelledby={titleId} className="md:max-w-2xl">
      <Card
        padding="lg"
        className="flex flex-col gap-4 md:flex-row md:items-center"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning [&_svg]:size-5"
          >
            <ShieldAlert />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <CardTitle
              as="h2"
              id={titleId}
              ref={title}
              tabIndex={-1}
              className="outline-none"
            >
              {disputed ? t("disputedTitle") : t("title")}
            </CardTitle>
            <CardText className="text-pretty">
              {disputed
                ? t("disputed", { business })
                : t("body", { date, business })}
            </CardText>
            {failed ? (
              <p role="alert" className="text-danger text-sm">
                {t("failed")}
              </p>
            ) : null}
          </span>
        </div>
        <div className="flex flex-col gap-2 md:shrink-0 md:flex-row">
          {disputed ? (
            <Button
              ref={hideButton}
              variant="secondary"
              onClick={hide}
              className="w-full md:w-auto"
            >
              {t("seen")}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                loading={pending}
                disabled={pending}
                onClick={dispute}
                className="w-full md:w-auto"
              >
                {t("dispute")}
              </Button>
              <Button
                ref={hideButton}
                variant="ghost"
                disabled={pending}
                onClick={hide}
                className="w-full md:w-auto"
              >
                {t("mine")}
              </Button>
            </>
          )}
        </div>
      </Card>
    </section>
  );
}

"use client";

import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { FileToday, FileTodayActions } from "../me/file/file-types";

/**
 * The account for wages changed (profile H5b, issue #82 §3.1): for 14 days
 * after a change, Today says when, on a quiet card, so someone whose phone
 * was taken over hears of it where they look every day. "לא שיניתי" marks
 * the account for the owner and the accountant to look at (no undo: it
 * destroys nothing, and they clear it), and the card says what follows,
 * with "הבנתי"; "אני שיניתי" hides it. Hidden is kept on this device only,
 * by the change's own moment, so another phone tells it again and a later
 * change is told anew. A refusal keeps the card as it was and says so
 * beside its buttons. After "לא שיניתי" the button it was on goes, so the
 * focus goes to the card's title.
 */
export function BankChangeCard({
  bank,
  business,
  actions,
}: {
  bank: NonNullable<FileToday["bank"]>;
  business: string;
  actions: FileTodayActions;
}) {
  const t = useTranslations("app.home.file.bank");
  const format = useFormatter();
  const router = useRouter();
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const [pending, start] = useTransition();
  const [pressed, setPressed] = useState<"dispute" | "seen" | null>(null);
  const [failed, setFailed] = useState(false);

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

  function press(which: "dispute" | "seen") {
    setPressed(which);
    setFailed(false);
    start(async () => {
      const answer = await (which === "dispute"
        ? actions.dispute()
        : actions.seen()
      ).catch(() => ({ ok: false, failure: "failed" }) as const);
      if (!answer.ok) setFailed(true);
      else if (answer.to) router.push(answer.to, { scroll: false });
    });
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
              variant="secondary"
              loading={pending && pressed === "seen"}
              disabled={pending}
              onClick={() => press("seen")}
              className="w-full md:w-auto"
            >
              {t("seen")}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                loading={pending && pressed === "dispute"}
                disabled={pending}
                onClick={() => press("dispute")}
                className="w-full md:w-auto"
              >
                {t("dispute")}
              </Button>
              <Button
                variant="ghost"
                loading={pending && pressed === "seen"}
                disabled={pending}
                onClick={() => press("seen")}
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

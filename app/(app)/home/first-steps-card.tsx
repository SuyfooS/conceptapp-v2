import {
  type FirstStep,
  type FirstStepsData,
  firstStepHref,
  isOptionalStep,
  nextStep,
  stepsCounted,
  stepsDone,
  stepsLeft,
} from "@domain/first-steps";
import { Badge } from "@ui/badge";
import { Card } from "@ui/card";
import { ProgressRing } from "@ui/progress-ring";
import { StepList, StepRow } from "@ui/step-list";
import type { Translator } from "../wording";
import { FirstStepsHides, HideFirstStepsButton } from "./first-steps-hide";

type T = Translator<"app">;

/** Today has one of these at most, so its title's id is fixed. */
const TITLE_ID = "first-steps-title";

/**
 * The owner's first steps (`currentFirstSteps`): how far along the business
 * is and what to do next, on the screen's one accent card, with every step
 * floating over it as a row that leads to the screen that does it, done ones
 * too, to check. Phone: the list over the card's bottom edge. Tablet: the
 * card across both of Today's columns, the list floating inside it in the
 * end one. Desktop: the same on Today's own columns, so the card lines up
 * with the hero under it and the list with the tiles.
 */
export function FirstStepsCard({
  data,
  t,
  path,
  hideUrl,
}: {
  data: FirstStepsData;
  t: T;
  /** A route in the app, or in the demo under /design/shell. */
  path: (to: string) => string;
  /** Where "הסתרה" is sent: /home/first-steps, or the demo's stand-in. */
  hideUrl: string;
}) {
  const { steps } = data;
  const counted = stepsCounted(steps);
  const done = stepsDone(steps);
  const next = nextStep(steps);
  const title = (step: FirstStep) =>
    t(`home.firstSteps.steps.${step.key}.title`);

  return (
    <FirstStepsHides
      url={data.hides ? hideUrl : null}
      hidden={t("home.firstSteps.hidden")}
      failed={t("home.firstSteps.hideFailed")}
    >
      <section
        aria-labelledby={TITLE_ID}
        className="flex flex-col md:grid md:grid-cols-2 md:gap-x-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-x-8"
      >
        <Card
          tone="accent"
          padding="lg"
          className="pb-[76px] md:col-span-2 md:col-start-1 md:row-start-1 md:grid md:grid-cols-subgrid md:pb-5"
        >
          <div className="flex min-w-0 flex-col md:col-start-1">
            <div className="flex items-center gap-3">
              <ProgressRing value={done} max={counted} />
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 id={TITLE_ID} className="font-semibold text-ink text-md">
                  {t("home.firstSteps.title")}
                </h2>
                <p className="text-ink-2 text-sm">
                  {t("home.firstSteps.progress", { done, total: counted })}
                </p>
              </div>
              <HideFirstStepsButton label={t("home.firstSteps.hide")} />
            </div>
            <p className="mt-4 text-balance font-bold text-ink text-xl">
              {t("home.firstSteps.remaining", { count: stepsLeft(steps) })}
            </p>
            {next ? (
              <p className="mt-1 text-base text-ink">
                {t("home.firstSteps.next", { step: title(next) })}
              </p>
            ) : null}
          </div>
        </Card>
        <StepList className="relative z-10 mx-3 -mt-[60px] md:col-start-2 md:row-start-1 md:m-3 md:self-start">
          {steps.map((step) => (
            <StepRow
              key={step.key}
              href={path(firstStepHref(step))}
              mark={step.done ? "done" : "open"}
              title={title(step)}
              state={
                step.done
                  ? t("home.firstSteps.done")
                  : t("home.firstSteps.open")
              }
              detail={detailOf(t, step)}
              badge={
                isOptionalStep(step) ? (
                  <Badge>{t("home.firstSteps.optional")}</Badge>
                ) : null
              }
            />
          ))}
        </StepList>
      </section>
    </FirstStepsHides>
  );
}

/** Where a step stands, in words: what is there, or what is still missing. */
function detailOf(t: T, step: FirstStep): string {
  switch (step.key) {
    case "team": {
      const { joined, invited, expired } = step.progress;
      if (joined > 0) {
        return invited > 0
          ? t("home.firstSteps.steps.team.doneWaiting", {
              count: joined,
              waiting: invited,
            })
          : t("home.firstSteps.steps.team.done", { count: joined });
      }
      if (invited > 0) {
        return t("home.firstSteps.steps.team.waiting", { count: invited });
      }
      if (expired > 0) {
        return t("home.firstSteps.steps.team.expired", { count: expired });
      }
      return t("home.firstSteps.steps.team.none");
    }
    case "shifts":
      return step.done
        ? t("home.firstSteps.steps.shifts.done", {
            positions: step.positions,
            shifts: step.patterns,
          })
        : t("home.firstSteps.steps.shifts.todo", {
            missing:
              step.positions > 0
                ? "shifts"
                : step.patterns > 0
                  ? "positions"
                  : "both",
          });
    case "departments":
      return step.done
        ? t("home.firstSteps.steps.departments.done", {
            count: step.departments,
          })
        : t("home.firstSteps.steps.departments.todo", { count: step.empty });
    case "publish":
      return step.done
        ? t("home.firstSteps.steps.publish.done")
        : t("home.firstSteps.steps.publish.todo");
    case "details":
      return step.missing === null
        ? t("home.firstSteps.steps.details.done", {
            address: step.address ?? "",
          })
        : t("home.firstSteps.steps.details.todo", { missing: step.missing });
    case "clockCode":
      return step.done
        ? t("home.firstSteps.steps.clockCode.done")
        : t("home.firstSteps.steps.clockCode.todo");
  }
}

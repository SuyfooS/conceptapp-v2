import type { ModeStatus } from "./modes";
import type { Translator } from "./wording";

/**
 * What a mode's way in says (`app.orders.home`): for a taker off a shift,
 * that it opens on one; for someone who runs orders off a shift, whose mode
 * opens all the same, what is ready and being made and that sending waits
 * for a shift; taking orders, what is ready and being made, or how to
 * start; only preparing, what waits in each department ("מטבח · 2 בהכנה").
 * Names a department after its separator only. Pure, beside the rows that
 * use it (mode-rows.tsx), so it is tested without a server.
 */
export function modeLine(
  t: Translator<"app.orders.home">,
  status: ModeStatus,
  departmentName: (id: string) => string,
): string {
  if (status.takes && status.clock && !status.runs) return t("offClock");
  if (status.takes) {
    const parts = [
      status.ready > 0 ? t("ready", { count: status.ready }) : null,
      status.making > 0 ? t("making", { count: status.making }) : null,
      status.clock ? t("sendWaits") : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(" · ") : t("idle");
  }
  return status.waiting.length > 0
    ? status.waiting
        .map(({ department, count }) =>
          t("waiting", { department: departmentName(department), count }),
        )
        .join(", ")
    : t("nothingWaiting");
}

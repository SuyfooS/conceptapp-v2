import type { PushAskState } from "@domain/push";
import type { TodayPushAsk } from "../../../(app)/notifications/push-ask-today";

/** The states Today's twin draws the card in, by `?push=`. */
const STATES: readonly PushAskState[] = [
  "off",
  "working",
  "on",
  "denied",
  "failed",
  "install",
];

/**
 * Today's card that offers notifications on the phone (closing the pilot,
 * PR 6), on the twin, by its query: `?push=off` before a press, `on`,
 * `denied` and `failed` after one, `working` with one on its way, `install`
 * as an iPhone's Safari draws it. Anything else, or none: no card, as in a
 * demo business.
 */
export function pushTwinOf(push: string | undefined): TodayPushAsk | null {
  const state = STATES.find((one) => one === push);
  return state ? { twin: state } : null;
}

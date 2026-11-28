import type { PushAskState } from "@domain/push";
import type { InstallTwin } from "../../../(app)/notifications/install-button";
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

/** The states a twin draws the install button in on Android (PR 7), by `?install=`. */
const INSTALL_STATES: readonly InstallTwin[] = [
  "ready",
  "prompting",
  "installed",
  "dismissed",
  "menu",
];

/**
 * The install button's state on a twin (closing the pilot, PR 7), by its
 * query: `?install=ready` with Chrome's offer there to ask (a press installs
 * after a moment's stand-in), `prompting` with Chrome asking, `installed`,
 * `dismissed` after a no, `menu` with no offer, the words that say where
 * Chrome's menu does it. Anything else, or none: no button, as on an iPhone
 * or a computer.
 */
export function installTwinOf(install: string | undefined): InstallTwin | null {
  return INSTALL_STATES.find((one) => one === install) ?? null;
}

/**
 * Today's card that offers notifications on the phone (closing the pilot,
 * PR 6), on the twin, by its query: `?push=off` before a press, `on`,
 * `denied` and `failed` after one (a press on `failed` fails again; any
 * other turns them on), `working` with one on its way, `install` as an
 * iPhone's Safari draws it. Anything else, or none: no card, as in a demo
 * business. With `?install=` (`installTwinOf`), the install button on
 * Android under its words.
 */
export function pushTwinOf(
  push: string | undefined,
  install?: string,
): TodayPushAsk | null {
  const state = STATES.find((one) => one === push);
  if (!state) return null;
  const button = installTwinOf(install);
  return button ? { twin: state, install: button } : { twin: state };
}

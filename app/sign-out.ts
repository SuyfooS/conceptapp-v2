import {
  closeFilesOnDevice,
  type TabsWindow,
} from "./(app)/team/[person]/file/file-tabs";
import type { SignOutAction } from "./sign-out-form";

/**
 * Signing out once nothing is left to ask (`SignOutForm`): the action ends
 * the session here. Where it answers a place to go, every open hiring file
 * on the device closes at once, in every tab and window (H6a,
 * `closeFilesOnDevice`): the action forgot their step-up on the server, and
 * nothing else would tell a window in sight, so the next person at a shared
 * computer never finds the last one's file open there. Then waiter mode's
 * records of whoever it was go (P7), and the page goes there as a whole new
 * page. Where it answers none (nobody signed in, the design demo's
 * stand-in), nothing happens.
 */
export async function signOutAndLeave(
  action: SignOutAction,
  device: {
    win: TabsWindow;
    /** Waiter mode's records of the person whose session ended. */
    clearOrders: (user: string | null) => Promise<void>;
    /** Opens the place as a whole new page. */
    go: (to: string) => void;
  },
): Promise<void> {
  const out = await action();
  if (!out?.to) return;
  closeFilesOnDevice(device.win);
  await device.clearOrders(out.user);
  device.go(out.to);
}

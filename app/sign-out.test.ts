import { describe, expect, it, vi } from "vitest";
import {
  FILE_TABS_CHANNEL,
  type TabsWindow,
} from "./(app)/team/[person]/file/file-tabs";
import { signOutAndLeave } from "./sign-out";
import type { SignedOut } from "./sign-out-form";

/*
 * Signing out (`SignOutForm`): the device's open hiring files close in every
 * tab and window as the session ends (H6a), before waiter mode's records go
 * and the page leaves, and never in the way of signing out.
 */

/** A window whose channel's messages are written down with the rest, in order. */
function windowOf(steps: string[], { blocked = false } = {}): TabsWindow {
  class Channel {
    constructor(readonly name: string) {
      if (blocked) throw new Error("SecurityError");
    }
    postMessage(data: unknown) {
      steps.push(`told ${this.name}: ${(data as { kind: string }).kind}`);
    }
    close() {}
  }
  return {
    BroadcastChannel: Channel,
    get localStorage() {
      if (blocked) throw new Error("SecurityError");
      return {
        setItem(key: string, value: string) {
          steps.push(`stored ${key}: ${value}`);
        },
      };
    },
    addEventListener() {},
    removeEventListener() {},
  } as unknown as TabsWindow;
}

function device(steps: string[], options?: { blocked?: boolean }) {
  return {
    win: windowOf(steps, options),
    clearOrders: async (user: string | null) => {
      steps.push(`cleared ${user}`);
    },
    go: (to: string) => {
      steps.push(`went ${to}`);
    },
  };
}

describe("signOutAndLeave", () => {
  it("closes the device's open files as it signs out, before its records go and the page leaves", async () => {
    const steps: string[] = [];
    const action = vi.fn(
      async (): Promise<SignedOut> => ({ to: "/enter", user: "u1" }),
    );
    await signOutAndLeave(action, device(steps));
    expect(action).toHaveBeenCalledExactlyOnceWith();
    expect(steps).toEqual([
      `told ${FILE_TABS_CHANNEL}: closed`,
      "cleared u1",
      "went /enter",
    ]);
  });

  it("closes them as a station signs out to its code, nobody named", async () => {
    const steps: string[] = [];
    await signOutAndLeave(
      async () => ({ to: "/clock/code", user: null }),
      device(steps),
    );
    expect(steps).toEqual([
      `told ${FILE_TABS_CHANNEL}: closed`,
      "cleared null",
      "went /clock/code",
    ]);
  });

  it("tells nothing and stays where the action answers no place", async () => {
    const answers: (SignedOut | null)[] = [null, { to: null, user: "u1" }];
    for (const answer of answers) {
      const steps: string[] = [];
      await signOutAndLeave(async () => answer, device(steps));
      expect(steps).toEqual([]);
    }
  });

  it("still signs out where no tab can be told", async () => {
    const steps: string[] = [];
    await signOutAndLeave(
      async () => ({ to: "/enter", user: "u1" }),
      device(steps, { blocked: true }),
    );
    expect(steps).toEqual(["cleared u1", "went /enter"]);
  });
});

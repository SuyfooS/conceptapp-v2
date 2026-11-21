import { beforeEach, describe, expect, it, vi } from "vitest";

// Sending what an action notified, with Next's `after`, the push settings and
// the delivery stood in for: nothing without the VAPID settings; at once
// after the answer by default; and, for "מוכן" (waiter mode P8b), after the
// wait asked for, at most PUSH_WAIT_MAX_MS.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  after: [] as (() => Promise<void>)[],
  config: null as { publicKey: string } | null,
  deliver: vi.fn(async () => {}),
}));
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => {
    mocks.after.push(task);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@db/push/env", () => ({ pushConfig: () => mocks.config }));
vi.mock("@db/push/deliver", () => ({ deliverDuePushes: mocks.deliver }));
vi.mock("@db/push/devices", () => ({ removePushDevice: vi.fn() }));
vi.mock("@db/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/origin", () => ({ requestOrigin: async () => "" }));

const { PUSH_WAIT_MAX_MS, pushSoon } = await import("./server");

beforeEach(() => {
  mocks.after = [];
  mocks.config = { publicKey: "key" };
  mocks.deliver.mockClear();
  vi.useRealTimers();
});

describe("pushSoon", () => {
  it("does nothing without the VAPID settings", () => {
    mocks.config = null;
    pushSoon();
    pushSoon({ waitMs: 11_000 });
    expect(mocks.after).toEqual([]);
  });

  it("sends what is due once the answer has gone", async () => {
    pushSoon();
    expect(mocks.after).toHaveLength(1);
    expect(mocks.deliver).not.toHaveBeenCalled();
    await mocks.after[0]?.();
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });

  it("waits first when asked, so a push written a few seconds late is due", async () => {
    vi.useFakeTimers();
    pushSoon({ waitMs: 11_000 });
    const sent = mocks.after[0]?.();
    await vi.advanceTimersByTimeAsync(10_999);
    expect(mocks.deliver).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await sent;
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });

  it("never waits longer than the route has", async () => {
    vi.useFakeTimers();
    pushSoon({ waitMs: 60_000 });
    const sent = mocks.after[0]?.();
    await vi.advanceTimersByTimeAsync(PUSH_WAIT_MAX_MS);
    await sent;
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
    expect(PUSH_WAIT_MAX_MS).toBe(15_000);
  });

  it("takes a wait that is no wait as none", async () => {
    vi.useFakeTimers();
    pushSoon({ waitMs: -5 });
    await mocks.after[0]?.();
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });
});

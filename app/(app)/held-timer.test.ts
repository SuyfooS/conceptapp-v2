import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { heldTimer } from "./held-timer";

describe("heldTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls due once, when its time is over", () => {
    const due = vi.fn();
    heldTimer(8000, due);
    vi.advanceTimersByTime(7999);
    expect(due).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(due).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(due).toHaveBeenCalledTimes(1);
  });

  it("waits while paused, then only the time it had left", () => {
    const due = vi.fn();
    const wait = heldTimer(8000, due);
    vi.advanceTimersByTime(3000);
    wait.pause();
    vi.advanceTimersByTime(60_000);
    expect(due).not.toHaveBeenCalled();
    wait.resume();
    vi.advanceTimersByTime(4999);
    expect(due).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(due).toHaveBeenCalledTimes(1);
  });

  it("keeps its time over more than one pause, and a second pause or resume changes nothing", () => {
    const due = vi.fn();
    const wait = heldTimer(8000, due);
    vi.advanceTimersByTime(2000);
    wait.pause();
    wait.pause();
    vi.advanceTimersByTime(10_000);
    wait.resume();
    wait.resume();
    vi.advanceTimersByTime(2000);
    wait.pause();
    vi.advanceTimersByTime(10_000);
    wait.resume();
    vi.advanceTimersByTime(3999);
    expect(due).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(due).toHaveBeenCalledTimes(1);
  });

  it("never calls due once cleared, running or paused", () => {
    const running = vi.fn();
    heldTimer(8000, running).clear();
    const paused = vi.fn();
    const wait = heldTimer(8000, paused);
    wait.pause();
    wait.clear();
    wait.resume();
    vi.advanceTimersByTime(60_000);
    expect(running).not.toHaveBeenCalled();
    expect(paused).not.toHaveBeenCalled();
  });

  it("does not start again once over", () => {
    const due = vi.fn();
    const wait = heldTimer(8000, due);
    vi.advanceTimersByTime(8000);
    wait.pause();
    wait.resume();
    vi.advanceTimersByTime(60_000);
    expect(due).toHaveBeenCalledTimes(1);
  });
});

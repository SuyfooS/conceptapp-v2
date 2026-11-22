import { describe, expect, it, vi } from "vitest";
import {
  deviceFileTabs,
  FILE_TABS_CHANNEL,
  FILE_TABS_TWIN_CHANNEL,
  type FileTabNews,
  newsOf,
  type TabsWindow,
} from "./file-tabs";

/*
 * The device's tabs told about its open hiring files (profile H6a): a file
 * locked in one tab is heard closed in every other at once, and activity in
 * one is heard in the others, on a BroadcastChannel or, where there is
 * none, through a storage event; never by the tab that told, never on
 * another channel (the twin's), and never with a throw.
 */

/** The answers asked for so far, all in. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** One device: its tabs' BroadcastChannels and storage reach each other, as a browser's do. */
function device() {
  const channels = new Set<FakeChannel>();
  const windows = new Set<{ dispatch: (key: string, value: string) => void }>();

  class FakeChannel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    closed = false;
    constructor(readonly name: string) {
      channels.add(this);
    }
    postMessage(data: unknown) {
      if (this.closed) throw new Error("InvalidStateError");
      const copy = structuredClone(data);
      // Every other channel of the name, in this tab and the others, later.
      for (const other of channels) {
        if (other === this || other.name !== this.name) continue;
        setTimeout(() => {
          if (!other.closed) other.onmessage?.({ data: copy } as MessageEvent);
        }, 0);
      }
    }
    close() {
      this.closed = true;
      channels.delete(this);
    }
  }

  function tab({
    channel = true,
    storage = true,
    channelThrows = false,
  }: {
    channel?: boolean;
    storage?: boolean;
    channelThrows?: boolean;
  } = {}) {
    const target = new EventTarget();
    let listening = 0;
    const me = {
      dispatch(key: string, value: string) {
        target.dispatchEvent(
          Object.assign(new Event("storage"), { key, newValue: value }),
        );
      },
    };
    windows.add(me);
    const win = {
      BroadcastChannel: channel
        ? channelThrows
          ? class {
              constructor() {
                throw new Error("SecurityError");
              }
            }
          : FakeChannel
        : undefined,
      get localStorage() {
        if (!storage) throw new Error("SecurityError");
        return {
          // The storage event goes to every other tab, never this one.
          setItem(key: string, value: string) {
            for (const other of windows) {
              if (other !== me) other.dispatch(key, value);
            }
          },
        };
      },
      addEventListener(...args: Parameters<EventTarget["addEventListener"]>) {
        listening += 1;
        target.addEventListener(...args);
      },
      removeEventListener(
        ...args: Parameters<EventTarget["removeEventListener"]>
      ) {
        listening -= 1;
        target.removeEventListener(...args);
      },
    };
    return {
      win: win as unknown as TabsWindow,
      listening: () => listening,
    };
  }

  return { tab, open: () => channels.size };
}

/** A tab's line, and all it heard. */
function line(win: TabsWindow, channel?: string) {
  const tabs = deviceFileTabs(win, channel);
  const heard: FileTabNews[] = [];
  const stop = tabs.hear((news) => heard.push(news));
  return { tabs, heard, stop };
}

describe("deviceFileTabs", () => {
  it("closes the file in every other tab at once, never in the tab that told", async () => {
    const phone = device();
    const a = line(phone.tab().win);
    const b = line(phone.tab().win);
    const c = line(phone.tab().win);
    a.tabs.tell({ kind: "closed" });
    await settle();
    expect(b.heard).toEqual([{ kind: "closed" }]);
    expect(c.heard).toEqual([{ kind: "closed" }]);
    expect(a.heard).toEqual([]);
  });

  it("says when a file was last used, and nothing else", async () => {
    const phone = device();
    const a = line(phone.tab().win);
    const b = line(phone.tab().win);
    a.tabs.tell({ kind: "active", at: 1_700_000_000_000 });
    await settle();
    expect(b.heard).toEqual([{ kind: "active", at: 1_700_000_000_000 }]);
  });

  it("tells through a storage event where there is no BroadcastChannel, each time", async () => {
    const phone = device();
    const a = line(phone.tab({ channel: false }).win);
    const b = line(phone.tab({ channel: false }).win);
    a.tabs.tell({ kind: "active", at: 5 });
    a.tabs.tell({ kind: "closed" });
    a.tabs.tell({ kind: "closed" });
    await settle();
    expect(b.heard).toEqual([
      { kind: "active", at: 5 },
      { kind: "closed" },
      { kind: "closed" },
    ]);
    expect(a.heard).toEqual([]);
  });

  it("is heard by a tab with a channel from one without, each once", async () => {
    const phone = device();
    const old = line(phone.tab({ channel: false }).win);
    const broken = line(phone.tab({ channelThrows: true }).win);
    const today = line(phone.tab().win);
    old.tabs.tell({ kind: "closed" });
    broken.tabs.tell({ kind: "active", at: 9 });
    today.tabs.tell({ kind: "active", at: 10 });
    await settle();
    expect(today.heard).toEqual([
      { kind: "closed" },
      { kind: "active", at: 9 },
    ]);
    // A channel's message reaches channels only: a tab that can't open one
    // hears the storage's (a browser's tabs all have one, or none).
    expect(old.heard).toEqual([{ kind: "active", at: 9 }]);
    expect(broken.heard).toEqual([{ kind: "closed" }]);
  });

  it("hears another channel's tabs not at all: the twin's never close a real file", async () => {
    const phone = device();
    const app = line(phone.tab().win, FILE_TABS_CHANNEL);
    const twin = line(phone.tab().win, FILE_TABS_TWIN_CHANNEL);
    const oldTwin = line(
      phone.tab({ channel: false }).win,
      FILE_TABS_TWIN_CHANNEL,
    );
    twin.tabs.tell({ kind: "closed" });
    oldTwin.tabs.tell({ kind: "closed" });
    await settle();
    expect(app.heard).toEqual([]);
    expect(twin.heard).toEqual([{ kind: "closed" }]);
  });

  it("hears no more once stopped, its channel closed and its listener gone", async () => {
    const phone = device();
    const tab = phone.tab();
    const a = line(tab.win);
    const b = line(phone.tab().win);
    expect(phone.open()).toBe(2);
    expect(tab.listening()).toBe(1);
    a.stop();
    a.stop();
    expect(phone.open()).toBe(1);
    expect(tab.listening()).toBe(0);
    b.tabs.tell({ kind: "closed" });
    await settle();
    expect(a.heard).toEqual([]);
    // Telling opens a channel of its own, closed at once.
    expect(phone.open()).toBe(1);
  });

  it("never throws: no channel and the site's data blocked", () => {
    const phone = device();
    const { win } = phone.tab({ channel: false, storage: false });
    const tabs = deviceFileTabs(win);
    expect(() => tabs.tell({ kind: "closed" })).not.toThrow();
    const heard = vi.fn();
    const stop = tabs.hear(heard);
    expect(() => stop()).not.toThrow();
  });

  it("leaves a stored value it can't read, and another key's", () => {
    const phone = device();
    const tab = phone.tab({ channel: false });
    const a = line(tab.win);
    const other = phone.tab({ channel: false });
    other.win.localStorage?.setItem(FILE_TABS_CHANNEL, "not json");
    other.win.localStorage?.setItem(
      "elsewhere",
      JSON.stringify({ kind: "closed", from: "x" }),
    );
    expect(a.heard).toEqual([]);
  });
});

describe("newsOf", () => {
  it("reads another tab's news, and nothing of its own or of no known shape", () => {
    expect(newsOf({ kind: "closed", from: "b" }, "a")).toEqual({
      kind: "closed",
    });
    expect(newsOf({ kind: "active", at: 7, from: "b", n: 3 }, "a")).toEqual({
      kind: "active",
      at: 7,
    });
    expect(newsOf({ kind: "closed", from: "a" }, "a")).toBeNull();
    expect(newsOf({ kind: "closed" }, "a")).toBeNull();
    expect(newsOf({ kind: "opened", from: "b" }, "a")).toBeNull();
    expect(newsOf({ kind: "active", from: "b" }, "a")).toBeNull();
    expect(
      newsOf({ kind: "active", at: Number.NaN, from: "b" }, "a"),
    ).toBeNull();
    expect(newsOf({ kind: "active", at: "7", from: "b" }, "a")).toBeNull();
    expect(newsOf("closed", "a")).toBeNull();
    expect(newsOf(null, "a")).toBeNull();
  });
});

/*
 * The device's tabs, told about its open hiring files (profile H6a, plan
 * §3.5; the rule is in ./open-watch). The files open on the device, not in a
 * tab (one step-up cookie), so "נעילת התיק" in one tab, or signing out,
 * closes the file in every other tab at once (`closed`). A tab whose own
 * check for activity there answered open says a file is in use (`active`),
 * and the others ask the server whether theirs is still open: the word
 * itself keeps nothing open. On a BroadcastChannel; where there is none
 * (Safari before 15.4), or it can't be opened, through a storage event,
 * which every other tab of the app hears. A tab never hears itself. Only
 * which of the two happened travels: never whose file, never a moment,
 * never a value.
 */

/** The app's channel, and the storage key of its fallback. */
export const FILE_TABS_CHANNEL = "conceptapp-file-open";

/** The twin's on /design, so locking a mock file never closes a real one. */
export const FILE_TABS_TWIN_CHANNEL = "conceptapp-file-open-design";

/** What one tab tells the device's others about its open file. */
export type FileTabNews =
  /** "נעילת התיק" there, or signing out: every open file on the device closes. */
  | { kind: "closed" }
  /** A file is in use there, and the server just said it is open: ask it too. */
  | { kind: "active" };

export type FileTabs = {
  /** Tells every other tab of the device. Never throws. */
  tell(news: FileTabNews): void;
  /** Hears the other tabs until the stop it returns. */
  hear(heard: (news: FileTabNews) => void): () => void;
};

/** What a tab offers for talking to the device's other tabs: its window. */
export type TabsWindow = Pick<
  Window,
  "addEventListener" | "removeEventListener"
> & {
  readonly BroadcastChannel?: typeof BroadcastChannel;
  /** Its accessor throws where the site's data is blocked. */
  readonly localStorage?: Pick<Storage, "setItem">;
};

/**
 * A message from another tab, read: its kind alone, whatever else it holds
 * (a tab of an older build sends a moment too); null for one of this tab's
 * own (`self`), or of a kind it doesn't know.
 */
export function newsOf(data: unknown, self: string): FileTabNews | null {
  if (!data || typeof data !== "object") return null;
  const { from, kind } = data as Record<string, unknown>;
  if (typeof from !== "string" || from === self) return null;
  if (kind === "closed" || kind === "active") return { kind };
  return null;
}

let made = 0;

/**
 * This tab's line to the device's other tabs on `channel`. Opening it reads
 * nothing of the window, so it is made anywhere; telling and hearing do.
 */
export function deviceFileTabs(
  win: TabsWindow,
  channel: string = FILE_TABS_CHANNEL,
): FileTabs {
  // Whose a message is: this tab's, apart from every other's.
  made += 1;
  const self = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.${made}`;
  // Each value written new, so a storage event goes out each time.
  let written = 0;

  /** The window's BroadcastChannel, while it has one. */
  function broadcast(): typeof BroadcastChannel | undefined {
    try {
      return win.BroadcastChannel;
    } catch {
      return undefined;
    }
  }

  function tell(news: FileTabNews): void {
    const message = { ...news, from: self };
    const Channel = broadcast();
    if (Channel) {
      try {
        const tabs = new Channel(channel);
        try {
          tabs.postMessage(message);
        } finally {
          tabs.close();
        }
        return;
      } catch {
        // It couldn't be opened: the storage event instead.
      }
    }
    try {
      written += 1;
      win.localStorage?.setItem(
        channel,
        JSON.stringify({ ...message, n: written }),
      );
    } catch {
      // The site's data is blocked: no other tab can be told.
    }
  }

  function hear(heard: (news: FileTabNews) => void): () => void {
    const stops: (() => void)[] = [];
    const take = (data: unknown) => {
      const news = newsOf(data, self);
      if (news) heard(news);
    };
    const Channel = broadcast();
    if (Channel) {
      try {
        const tabs = new Channel(channel);
        tabs.onmessage = (event: MessageEvent) => take(event.data);
        stops.push(() => tabs.close());
      } catch {
        // It couldn't be opened here: the storage event still is heard.
      }
    }
    // Always heard too: a tab whose channel can't open tells this way.
    const stored = (event: StorageEvent) => {
      if (event.key !== channel || !event.newValue) return;
      let data: unknown;
      try {
        data = JSON.parse(event.newValue);
      } catch {
        return;
      }
      take(data);
    };
    win.addEventListener("storage", stored);
    stops.push(() => win.removeEventListener("storage", stored));
    return () => {
      for (const stop of stops.splice(0)) stop();
    };
  }

  return { tell, hear };
}

/**
 * The session on this device just ended (signed out, or the device locked
 * as a station), which forgot the files' step-up on the server: every open
 * file on the device closes now, in every tab and window, which nothing
 * else would tell a window that is in sight (it asks the server only on a
 * press, another tab's word, coming back, or its 15 minutes passing). Never
 * throws, so it never stands in the way of signing out.
 */
export function closeFilesOnDevice(win: TabsWindow): void {
  try {
    deviceFileTabs(win).tell({ kind: "closed" });
  } catch {
    // No tab could be told: theirs ask the server on their own.
  }
}

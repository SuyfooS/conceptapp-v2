import { describe, expect, it, vi } from "vitest";
import { modeToast, type ShownToast } from "./mode-toast";

type Said = {
  text: string;
  undo: (() => void) | null;
  onWaitingChange: ((waiting: boolean) => void) | null;
};

/** The mode's toast, with what it last drew. */
function setUp() {
  const drawn: (ShownToast<Said> | null)[] = [];
  const toast = modeToast<Said>((shown) => drawn.push(shown));
  const last = () => drawn.at(-1) ?? null;
  return { toast, last };
}

const plain = (text: string): Said => ({
  text,
  undo: null,
  onWaitingChange: null,
});
const withUndo = (
  text: string,
  onWaitingChange: Said["onWaitingChange"] = null,
): Said => ({ text, undo: vi.fn(), onWaitingChange });

describe("the mode's one toast", () => {
  it("takes a take-back's toast away once it went, and tells what waited for it", async () => {
    const { toast, last } = setUp();
    // "הוחזר מהשליחה: חומוס" with "ביטול", and bar 3 turns ready meanwhile.
    const withdraw = toast.say(withUndo("takenBack"));
    const news = vi.fn();
    toast.tell("ready", news);
    expect(news).not.toHaveBeenCalled();
    // The screen was left: the take-back goes, and its way back with it.
    withdraw();
    expect(last()).toBeNull();
    expect(toast.shown()).toBeNull();
    // Told once what withdrew it is done, with nothing said in its place.
    await Promise.resolve();
    expect(news).toHaveBeenCalledTimes(1);
    // Nothing offers a way back now: the next news is told at once.
    const next = vi.fn();
    toast.tell("ready", next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("keeps the news waiting when the next take-back's toast comes as the last one is withdrawn", async () => {
    const { toast, last } = setUp();
    // Salad taken back at table 4, and bar 6 turns ready within its 8 s.
    const withdrawSalad = toast.say(withUndo("takenBack: salad"));
    const news = vi.fn(() => {
      toast.say(plain("ready"));
    });
    toast.tell("ready", news);
    // Hummus taken back: its hold sends Salad's, which withdraws Salad's
    // toast, and Hummus's toast comes in the same turn.
    withdrawSalad();
    toast.say(withUndo("takenBack: hummus"));
    await Promise.resolve();
    // Hummus's "ביטול" is what shows, and the news still waits for it.
    expect(news).not.toHaveBeenCalled();
    expect(last()?.text).toBe("takenBack: hummus");
    // Its time is up: the news, once.
    toast.hidden(toast.shown()?.id ?? null);
    expect(news).toHaveBeenCalledTimes(1);
    expect(last()?.text).toBe("ready");
  });

  it("never puts a round that landed in a way back's place, and tells it and the ready news in turn", () => {
    const { toast, last } = setUp();
    // "הוגש" with "ביטול" at table 6.
    toast.say(withUndo("served"));
    // Table 4's round lands with no screen waiting, then bar 3 turns ready.
    toast.tell("sent:round-4", () => {
      toast.say(plain("sent: 4"));
    });
    toast.tell("ready", () => {
      toast.say(plain("ready: bar 3"));
    });
    expect(last()?.text).toBe("served");
    // The serve's time is up: the round first, then the ready news.
    toast.hidden(toast.shown()?.id ?? null);
    expect(last()?.text).toBe("sent: 4");
    toast.hidden(toast.shown()?.id ?? null);
    expect(last()?.text).toBe("ready: bar 3");
    // Nothing more waited.
    toast.hidden(toast.shown()?.id ?? null);
    expect(last()?.text).toBe("ready: bar 3");
  });

  it("tells the next news at once when the first has nothing left to say", () => {
    const { toast, last } = setUp();
    toast.say(withUndo("served"));
    // Bar 3 was served before the way back went: nothing to say of it.
    const nothing = vi.fn();
    toast.tell("ready", nothing);
    toast.tell("sent:round-4", () => {
      toast.say(plain("sent: 4"));
    });
    toast.hidden(toast.shown()?.id ?? null);
    expect(nothing).toHaveBeenCalledTimes(1);
    expect(last()?.text).toBe("sent: 4");
  });

  it("keeps a newer toast in its place: an older one's withdrawal changes nothing", () => {
    const { toast, last } = setUp();
    const withdrawBack = toast.say(withUndo("takenBack"));
    // Served at table 6 before the take-back went: "ביטול" of the serve.
    toast.say(withUndo("served"));
    const news = vi.fn();
    toast.tell("ready", news);
    withdrawBack();
    expect(last()?.text).toBe("served");
    expect(toast.shown()?.text).toBe("served");
    // The serve's way back is still offered: the news still waits.
    expect(news).not.toHaveBeenCalled();
    // Its time is up: the news, once.
    toast.hidden(toast.shown()?.id ?? null);
    expect(news).toHaveBeenCalledTimes(1);
  });

  it("withdraws only what it said: a second withdrawal, or one after a newer toast, does nothing", () => {
    const { toast, last } = setUp();
    const withdraw = toast.say(withUndo("takenBack"));
    withdraw();
    toast.say(plain("sent"));
    withdraw();
    expect(last()?.text).toBe("sent");
  });

  it("tells a toast that stopped counting it goes on as a newer one comes, unless it was withdrawn", () => {
    const { toast } = setUp();
    const heard = vi.fn();
    toast.say(withUndo("takenBack", heard));
    // The keyboard on its "ביטול": the take-back waits.
    toast.waiting(true);
    expect(heard).toHaveBeenLastCalledWith(true);
    // Replaced while it waited: it goes on, and lands.
    toast.say(plain("sent"));
    expect(heard).toHaveBeenLastCalledWith(false);

    const gone = vi.fn();
    const withdraw = toast.say(withUndo("takenBack", gone));
    toast.waiting(true);
    // It went already (the screen left): nothing to go on with.
    withdraw();
    toast.say(plain("sent"));
    expect(gone).toHaveBeenCalledTimes(1);
    expect(gone).toHaveBeenLastCalledWith(true);
  });

  it("lets go of what a way back held when it is pressed, and tells what waited", () => {
    const { toast, last } = setUp();
    const heard = vi.fn();
    const back = withUndo("takenBack", heard);
    toast.say(back);
    toast.waiting(true);
    const news = vi.fn();
    toast.tell("ready", news);
    toast.undo();
    expect(back.undo).toHaveBeenCalledTimes(1);
    expect(last()).toBeNull();
    expect(news).toHaveBeenCalledTimes(1);
    // Its undo let go of the take-back: nothing hears it goes on.
    toast.say(plain("sent"));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("holds the news back when an older toast is seen going after a newer way back was said", () => {
    const { toast } = setUp();
    toast.say(plain("sent"));
    const drawnId = toast.shown()?.id ?? null;
    toast.say(withUndo("served"));
    const news = vi.fn();
    toast.tell("ready", news);
    // The sent toast's time ran out before the serve's was drawn.
    toast.hidden(drawnId);
    expect(news).not.toHaveBeenCalled();
    toast.hidden(toast.shown()?.id ?? null);
    expect(news).toHaveBeenCalledTimes(1);
  });

  it("goes as its way to what it names is pressed, and tells what waited", () => {
    const { toast, last } = setUp();
    toast.say(withUndo("removed"));
    const news = vi.fn();
    toast.tell("ready", news);
    toast.say(plain("ready"));
    // A plain toast took the way back's place: news waits for it to go.
    expect(news).not.toHaveBeenCalled();
    toast.close();
    expect(last()).toBeNull();
    expect(news).toHaveBeenCalledTimes(1);
  });
});

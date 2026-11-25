import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import { ACTIONS_NAME_WORDS, actionsNameValues } from "./actions-name";

/*
 * The name of a message's actions button (accessibility, part 7, after
 * review): whose message, when, and how it starts, so the buttons of a run
 * of one person's messages in a minute, or of the same time on two days,
 * read apart in a list of the page's buttons.
 */

const t = createTranslator({
  locale: "he",
  messages: he,
  namespace: "app.chat.messageActions",
});
const tEn = createTranslator({
  locale: "en",
  messages: en,
  namespace: "app.chat.messageActions",
});

const TODAY = "2026-11-25";
const LRI = "⁦";
const PDI = "⁩";

/** Noa's message, as the button names it. */
const fromNoa = (day: string, time: string, words: string) =>
  t.markup("openFor", {
    name: "נועה כהן",
    ...actionsNameValues({ day, today: TODAY, time, words }),
  });

describe("a message's actions button's name", () => {
  it("starts with the tooltip's word, then whose and when, in isolates", () => {
    expect(fromNoa(TODAY, "08:14", "מגיעה בעוד עשר דקות")).toBe(
      `פעולות להודעה של נועה כהן מ-${LRI}08:14${PDI}: מגיעה בעוד עשר דקות`,
    );
    expect(
      t.markup("openForOwn", {
        ...actionsNameValues({
          day: TODAY,
          today: TODAY,
          time: "08:15",
          words: "סיימנו לסדר להיום",
        }),
      }),
    ).toBe(`פעולות להודעה שלך מ-${LRI}08:15${PDI}: סיימנו לסדר להיום`);
  });

  it("reads apart for a run of one person's messages in the same minute", () => {
    const first = fromNoa(TODAY, "08:14", "בוקר טוב");
    const second = fromNoa(TODAY, "08:14", "הספק מגיע ב-10:00");
    expect(first).not.toBe(second);
    expect(first.startsWith(t("open"))).toBe(true);
    expect(second.startsWith(t("open"))).toBe(true);
  });

  it("says the day when it isn't today's, so the same time on two days reads apart", () => {
    const words = "בוקר טוב";
    const names = [
      fromNoa(TODAY, "08:14", words),
      fromNoa("2026-11-24", "08:14", words),
      fromNoa("2026-11-01", "08:14", words),
      fromNoa("2025-11-24", "08:14", words),
    ];
    expect(new Set(names).size).toBe(names.length);
    expect(names[1]).toBe(
      `פעולות להודעה של נועה כהן מאתמול ב-${LRI}08:14${PDI}: ${words}`,
    );
    expect(names[2]).toBe(
      `פעולות להודעה של נועה כהן מ-${LRI}1.11${PDI} ב-${LRI}08:14${PDI}: ${words}`,
    );
    // Another year's says which.
    expect(names[3]).toContain(`${LRI}24.11.25${PDI}`);
  });

  it("says only how a long message starts", () => {
    const long = "מחר בבוקר ".repeat(12).trim();
    const values = actionsNameValues({
      day: TODAY,
      today: TODAY,
      time: "08:14",
      words: long,
    });
    expect([...values.words].length).toBeLessThanOrEqual(
      ACTIONS_NAME_WORDS + 1,
    );
    expect(values.words.endsWith("…")).toBe(true);
    expect(long.startsWith(values.words.slice(0, -1))).toBe(true);
  });

  it("reads the same way in English", () => {
    const values = (day: string) =>
      actionsNameValues({ day, today: TODAY, time: "08:14", words: "Hi" });
    expect(tEn.markup("openFor", { name: "Noa", ...values(TODAY) })).toBe(
      `Actions for the message from Noa at ${LRI}08:14${PDI}: Hi`,
    );
    expect(
      tEn.markup("openFor", { name: "Noa", ...values("2026-11-24") }),
    ).toBe(
      `Actions for the message from Noa yesterday at ${LRI}08:14${PDI}: Hi`,
    );
    expect(tEn.markup("openForOwn", values("2026-11-01"))).toBe(
      `Actions for your message from ${LRI}1.11${PDI} at ${LRI}08:14${PDI}: Hi`,
    );
  });
});

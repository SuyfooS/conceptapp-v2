import { FSI, isolateName, PDI } from "@domain/bidi";
import { INVITE_DAYS } from "@domain/invites";
import { shareText } from "@domain/share";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Every invite's link goes out on WhatsApp, with a sentence that says what it
// is (closing the pilot, PR 4), drawn on the server as a page first is: a chat
// to the number the link was made for, the sentence and the link written,
// and the copy as the second way; a twin's goes to nobody. The person sending
// still presses send in WhatsApp: nothing is sent from here.

const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { InviteShare } = await import("./invite-share");
const he = (await import("@/messages/he.json")).default;
const en = (await import("@/messages/en.json")).default;

const heT = createTranslator({ locale: "he", messages: he });

const LINK =
  "https://app.example/join/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd";
const PHONE = "+972500000911";
const NAME = "תמר חדשה";
const BUSINESS = "מסעדת הדגמה";

type Props = Parameters<typeof InviteShare>[0];

function drawn(
  over: Partial<Props> = {},
  messages: typeof he = he,
  locale = "he",
): string {
  const missing: string[] = [];
  const provider = {
    locale,
    timeZone: "Asia/Jerusalem",
    messages,
    onError: (error: Error) => {
      missing.push(error.message);
    },
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  const props: Props = {
    link: LINK,
    phone: PHONE,
    name: NAME,
    share: { business: BUSINESS, toNumber: true },
    copy: {
      label: heT("app.team.link.linkFor", { name: NAME }),
      hint: he.app.team.link.hint,
      copy: he.app.team.link.copy,
      copied: he.app.team.link.copied,
      failed: he.app.team.link.copyFailed,
    },
    ...over,
  };
  const html = renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(InviteShare, props),
    ),
  );
  expect(missing).toEqual([]);
  return html;
}

const unescaped = (html: string) =>
  html
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

/** The one WhatsApp link drawn, as the browser reads its href. */
function whatsappOf(html: string): URL {
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map(([, href = ""]) =>
    unescaped(href),
  );
  const whatsapp = hrefs.filter((href) => href.startsWith("https://wa.me/"));
  expect(whatsapp).toHaveLength(1);
  return new URL(whatsapp[0] ?? "");
}

/** The anchor's own tag, its attributes as drawn. */
const anchorOf = (html: string) =>
  unescaped(/<a [^>]*href="https:\/\/wa\.me\/[^>]*>/.exec(html)?.[0] ?? "");

const teamText = (business = BUSINESS) =>
  shareText(
    heT("app.team.pending.message", { business: isolateName(business) }),
    LINK,
  );

describe("an invite's link on WhatsApp", () => {
  it("opens a chat to the number it was made for, the sentence and the link written", () => {
    const href = whatsappOf(drawn());
    expect(`${href.origin}${href.pathname}`).toBe("https://wa.me/972500000911");
    expect([...href.searchParams.keys()]).toEqual(["text"]);
    expect(href.searchParams.get("text")).toBe(teamText());
    // The sentence, then the link on its own line.
    expect(href.searchParams.get("text")?.split("\n")).toEqual([
      heT("app.team.pending.message", { business: isolateName(BUSINESS) }),
      LINK,
    ]);
  });

  it("names nobody in the text: no person, no number", () => {
    const text = whatsappOf(drawn()).searchParams.get("text") ?? "";
    expect(text).not.toContain(NAME);
    expect(text).not.toContain("972500000911");
    expect(text).not.toContain("050");
  });

  it("holds the business as a name, so a Latin one leaves the sentence right to left", () => {
    const text =
      whatsappOf(
        drawn({ share: { business: "Bakery 12", toNumber: true } }),
      ).searchParams.get("text") ?? "";
    expect(text).toBe(teamText("Bakery 12"));
    expect(text.startsWith(`${FSI}Bakery 12${PDI} `)).toBe(true);
  });

  it("goes with the owner's own sentence where the console says so", () => {
    const text =
      whatsappOf(drawn({ words: "owner" })).searchParams.get("text") ?? "";
    expect(text).toBe(
      shareText(
        heT("admin.setup.invite.ownerMessage", {
          business: isolateName(BUSINESS),
        }),
        LINK,
      ),
    );
    expect(text).not.toContain(
      heT("app.team.pending.message", { business: isolateName(BUSINESS) }),
    );
  });

  it("asks whom to send it to on a twin, whose numbers are made up", () => {
    const href = whatsappOf(
      drawn({ share: { business: BUSINESS, toNumber: false } }),
    );
    expect(`${href.origin}${href.pathname}`).toBe("https://wa.me/");
    expect(href.searchParams.get("text")).toBe(teamText());
  });

  it("asks whom to send it to with no number, and never breaks on a bad one", () => {
    for (const phone of [null, "", "050-000-0911"]) {
      const href = whatsappOf(drawn({ phone }));
      expect(`${href.origin}${href.pathname}`, String(phone)).toBe(
        "https://wa.me/",
      );
    }
  });

  it("is a real link, opened by the press itself, named by whose link it sends", () => {
    const anchor = anchorOf(drawn());
    expect(anchor).toContain('target="_blank"');
    expect(anchor).toContain('rel="noopener noreferrer"');
    expect(anchor).toContain(
      `aria-label="${heT("app.team.pending.whatsappFor", { name: NAME })}"`,
    );
    // Clear of the tab bar when the focus is brought to it.
    expect(anchor).toContain("max-xl:scroll-mb-");
  });

  it("takes the accent as the screen's one main action, and is quiet in a row", () => {
    expect(anchorOf(drawn({ main: true }))).toContain("bg-accent");
    expect(anchorOf(drawn())).not.toContain("bg-accent");
    expect(anchorOf(drawn())).toContain("bg-surface-2");
  });

  it("keeps the copy as the second way, with its link and label", () => {
    const html = unescaped(drawn());
    expect(html).toContain(`value="${LINK}"`);
    expect(html).toContain(heT("app.team.link.linkFor", { name: NAME }));
    expect(html).toContain(he.app.team.link.copy);
    // WhatsApp first, the copy after it.
    expect(html.indexOf("https://wa.me/")).toBeLessThan(
      html.indexOf(he.app.team.link.copy),
    );
  });

  it("says WhatsApp opened only once it did, as the screen keeps it", () => {
    expect(drawn()).not.toContain(he.app.team.pending.opened);
    expect(drawn({ opened: true })).toContain(he.app.team.pending.opened);
    expect(drawn({ opened: false })).not.toContain(he.app.team.pending.opened);
  });

  it("follows the language it is drawn in", () => {
    const enT = createTranslator({ locale: "en", messages: en });
    const text =
      whatsappOf(drawn({}, en as typeof he, "en")).searchParams.get("text") ??
      "";
    expect(text).toBe(
      shareText(
        enT("app.team.pending.message", { business: isolateName(BUSINESS) }),
        LINK,
      ),
    );
  });
});

describe("the invite's sentences", () => {
  const sentences = {
    he: [he.app.team.pending.message, he.admin.setup.invite.ownerMessage],
    en: [en.app.team.pending.message, en.admin.setup.invite.ownerMessage],
  };

  it("say the link lasts as long as an invite stays open", () => {
    // Every link the database makes opens its invite for 14 days
    // (`expires_at = now() + interval '14 days'`), as INVITE_DAYS says.
    expect(he.app.team.pending.message).toContain(`${INVITE_DAYS} יום`);
    expect(en.app.team.pending.message).toContain(`${INVITE_DAYS} days`);
  });

  it("name the business and the app, and say a code comes by SMS", () => {
    for (const sentence of [...sentences.he, ...sentences.en]) {
      expect(sentence).toContain("{business}");
      expect(sentence).toContain("ConceptApp");
      expect(sentence).toContain("SMS");
      // A full stop: never a colon that reads the link as "the number".
      expect(sentence.trim().endsWith(".")).toBe(true);
      expect(sentence).not.toContain("!");
    }
  });
});

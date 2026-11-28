import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The send list of the Team screen's import (inviting from a list, part 5),
// drawn on the server as a page first is: each person on the list with no
// link yet, by name, with "יצירת קישור" named by whose in each shape (a
// list on a phone and a tablet, a table on a computer) and how many are
// left; those whose link ran out folded into one row until asked for.
// Nothing is made here, and no WhatsApp link exists before a link does.

vi.mock("server-only", () => ({}));

const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const { DoneExpired, DoneLinks, DoneSendList, keptAsMade } = await import(
  "./done-send"
);
const { PENDING_LIST } = await import("../pending-links");
const he = (await import("@/messages/he.json")).default;

const heT = createTranslator({ locale: "he", messages: he });

const resend = async () => ({}) as never;
const send = {
  firstLink: resend,
  renew: resend,
  business: "חנות הדגמה",
  toNumber: true,
};

const row = (id: string, name: string, phone: string, role = "צוות") => ({
  id,
  name,
  shown: name,
  phone,
  role,
  send: "link" as const,
  cancels: false,
});

const rows = [
  row("b", "בנימין חדש", "+972500007912", "ניהול"),
  row("a", "אביגיל חדשה", "+972500007911"),
];

function drawn(children: ReturnType<typeof createElement>): string {
  const missing: string[] = [];
  const provider = {
    locale: "he",
    timeZone: "Asia/Jerusalem",
    messages: he,
    onError: (error: Error) => {
      missing.push(error.message);
    },
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  const html = renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(DoneLinks, { send, rows, children }),
    ),
  );
  expect(missing).toEqual([]);
  return html;
}

const text = (html: string) => html.replace(/<[^>]+>/g, "");
const count = (page: string, part: string) => page.split(part).length - 1;

describe("the done screen's send list", () => {
  it("lists each person by name, with how many are left and how to send, in every shape", () => {
    const html = drawn(createElement(DoneSendList, { count: rows.length }));
    const page = text(html);
    expect(page).toContain(he.app.team.pending.title);
    expect(page).toContain(heT("app.team.pending.count", { count: 2 }));
    expect(page).toContain(he.app.team.pending.hint);
    // By name, as /team lists them.
    expect(page.indexOf("אביגיל חדשה")).toBeLessThan(
      page.indexOf("בנימין חדש"),
    );
    for (const person of rows) {
      expect(
        count(
          html,
          `aria-label="${heT("app.team.pending.createFor", { name: person.name })}"`,
        ),
        person.name,
      ).toBe(2);
    }
    expect(count(html, 'data-pending-create="a"')).toBe(2);
    // The next person is found in the shape on screen.
    expect(count(html, `${PENDING_LIST}=""`)).toBe(2);
    expect(html).toContain('<span dir="ltr">050-000-7911</span>');
    expect(page).toContain("ניהול");
    // No link is made until it is asked for: no WhatsApp yet.
    expect(html).not.toContain("wa.me");
  });

  it("draws nothing with nobody to send a link to", () => {
    expect(text(drawn(createElement(DoneSendList, { count: 0 })))).toBe("");
  });

  it("folds those whose link ran out into one row, each with its new link once opened", () => {
    const html = drawn(
      createElement(DoneExpired, {
        rows: [
          {
            id: "ran-out",
            name: "גלעד ותיק",
            shown: "גלעד ותיק",
            phone: "+972500007913",
            role: "צוות",
          },
        ],
        renew: resend,
        share: send,
      }),
    );
    const page = text(html);
    expect(page).toContain(he.app.team.import.done.expired.title);
    expect(page).toContain(
      heT("app.team.import.done.expired.count", { count: 1 }),
    );
    expect(page).toContain(he.app.team.import.groups.show);
    expect(html).toContain('aria-expanded="false"');
    // Folded: the person and their "קישור חדש" wait until it is opened.
    expect(page).not.toContain("גלעד ותיק");
    expect(html).not.toContain(
      heT("app.team.link.newFor", { name: "גלעד ותיק" }),
    );
  });

  it("draws no expired row with none", () => {
    expect(
      text(
        drawn(
          createElement(DoneExpired, { rows: [], renew: resend, share: send }),
        ),
      ),
    ).toBe("");
  });
});

describe("keptAsMade", () => {
  // A press on its way when the done card goes (its list taken back, or
  // another list started): its row is gone, so the screen keeps the link,
  // and the card brought back by "ביטול" shows it.
  const form = new FormData();

  it("keeps the link on the screen as it arrives, and answers as the action does", async () => {
    const kept: [string, string][] = [];
    const asked: string[] = [];
    const made = keptAsMade(
      async (inviteId) => {
        asked.push(inviteId);
        return { link: `https://app.example/join/${inviteId}` };
      },
      (inviteId, link) => kept.push([inviteId, link]),
    );
    expect(await made("dana", {}, form)).toEqual({
      link: "https://app.example/join/dana",
    });
    expect(asked).toEqual(["dana"]);
    expect(kept).toEqual([["dana", "https://app.example/join/dana"]]);
  });

  it("keeps nothing for a refusal, a link made elsewhere among them", async () => {
    const kept: string[] = [];
    for (const failure of ["linked", "failed"] as const) {
      const made = keptAsMade(
        async () => ({ failure }),
        (inviteId) => kept.push(inviteId),
      );
      expect(await made("dana", {}, form)).toEqual({ failure });
    }
    expect(kept).toEqual([]);
  });

  it("answers the same with no screen to keep it on", async () => {
    const made = keptAsMade(
      async () => ({ link: "https://app.example/join/x" }),
      undefined,
    );
    expect(await made("x", {}, form)).toEqual({
      link: "https://app.example/join/x",
    });
  });
});

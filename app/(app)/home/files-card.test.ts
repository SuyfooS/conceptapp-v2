import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The accountant's card of the staff's hiring files on Home (profile H6a):
// how many files miss anything, the 101s not in while the business takes
// them in the app, the accounts to look at, and the way to the files, drawn
// with every word there.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { createTranslator } = await import("next-intl");
const { FilesCard } = await import("./accountant-home");
const { baseWording } = await import("../wording");
const he = (await import("@/messages/he.json")).default;

const heT = createTranslator({ locale: "he", messages: he });
const text = (html: string) => html.replace(/<[^>]+>/g, "");

const draw = (files: Parameters<typeof FilesCard>[0]["files"]) =>
  renderToString(createElement(FilesCard, { files, wording: baseWording }));

describe("the accountant's files card", () => {
  it("says what waits in the files, and leads to them", () => {
    const html = draw({
      files: 7,
      missing: 2,
      form101Open: 1,
      bankReviews: 3,
      form101: true,
      href: "/team",
    });
    const page = text(html);
    expect(page).toContain(he.app.home.accountant.files.title);
    expect(page).toContain(
      heT("app.home.accountant.files.missing", { count: 2 }),
    );
    expect(page).toContain(
      heT("app.home.accountant.files.form101", { count: 1 }),
    );
    expect(page).toContain(
      heT("app.home.accountant.files.reviews", { count: 3 }),
    );
    expect(html).toContain('href="/team"');
  });

  it("says every file is complete, with no 101 line outside the app and no account line at none", () => {
    const page = text(
      draw({
        files: 7,
        missing: 0,
        form101Open: 4,
        bankReviews: 0,
        form101: false,
        href: "/team",
      }),
    );
    expect(page).toContain(
      heT("app.home.accountant.files.missing", { count: 0 }),
    );
    expect(page).not.toContain(
      heT("app.home.accountant.files.form101", { count: 4 }),
    );
    expect(page).not.toContain(
      heT("app.home.accountant.files.reviews", { count: 0 }),
    );
  });

  // The second review: an owner who brought the accountant in before any
  // staff. No file is no complete file, and the way leads to nothing yet.
  it("says there is no one on the staff yet, never that every file is complete", () => {
    const html = draw({
      files: 0,
      missing: 0,
      form101Open: 0,
      bankReviews: 0,
      form101: true,
      href: "/team",
    });
    const page = text(html);
    expect(page).toContain(he.app.home.accountant.files.title);
    expect(page).toContain(he.app.home.accountant.files.none);
    expect(page).not.toContain(
      heT("app.home.accountant.files.missing", { count: 0 }),
    );
    expect(page).not.toContain(
      heT("app.home.accountant.files.form101", { count: 0 }),
    );
    expect(html).not.toContain('href="/team"');
  });
});

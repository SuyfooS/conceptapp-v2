import he from "../messages/he.json" with { type: "json" };
import { announcer, heardSoFar, saidSince } from "./announcer";
import { HOLD_MS } from "./build-screen";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// Accessibility, part 6, on the Team screen's twins (/design/shell/team and
// its invite form): no data, no sign-in, nothing stored, so a deletion can
// run out its hold and a link be made as often as the test likes. The real
// screens' own checks are in team-changes.spec.ts and team-invite.spec.ts.

const tt = he.app.team;
const ti = tt.invite;
const tl = tt.link;
// The twin's two invites (app/design/shell/data.ts): one open, one expired.
const DANA = "דנה אברהם";
const RON = "רון שפירא";

/** A person's "מחיקת ההזמנה", in whichever shape is on screen. */
const deleteFor = (page: Page, name: string) =>
  page
    .getByRole("button", { name: heT("app.team.cancel.label", { name }) })
    .filter({ visible: true });

/** The "ביטול" of a person's deleted invite, in whichever shape is on screen. */
const undoFor = (page: Page, name: string) =>
  page
    .getByRole("status")
    .filter({ hasText: heT("app.team.cancel.done", { name }) })
    .filter({ visible: true })
    .getByRole("button", { name: he.ui.undoRow.undo });

// A deleted invite's "ביטול" takes the focus its button had, in each shape
// (both draw it; only the one on screen can take it). With the keyboard on
// it the hold waits; undone, the focus is back on the row's "מחיקת ההזמנה".
// After a mouse's press nothing waits, and once it goes the title of the
// invites' section has the focus, or, with no invite left on a phone's or
// tablet's lists (whose section is drawn anew after the team then), the
// page's title. The desktop's table lists the team too, so its section
// keeps it.
test("the team twin's deleted invite gives 'ביטול' the focus, waits for the keyboard, and gives the focus on", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const desktop = testInfo.project.name === "desktop";
  const section = page.getByRole("main").getByRole("heading", {
    level: 2,
    name: desktop ? tt.everyone : tt.invites.title,
    exact: true,
  });
  const title = page.getByRole("heading", { level: 1, name: tt.title });

  await page.goto("/design/shell/team");
  await page.waitForLoadState("networkidle");
  await deleteFor(page, DANA).focus();
  await page.keyboard.press("Enter");
  await expect(undoFor(page, DANA)).toBeFocused();
  await expect(deleteFor(page, DANA)).toHaveCount(0);
  // Past the hold, with the keyboard on it: still there.
  await page.waitForTimeout(HOLD_MS + 1_000);
  await expect(undoFor(page, DANA)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(deleteFor(page, DANA)).toBeFocused();
  await expect(undoFor(page, DANA)).toHaveCount(0);

  // The twin keeps nothing: afresh, and with a mouse.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await deleteFor(page, DANA).click();
  await expect(undoFor(page, DANA)).toBeFocused();
  await expect(undoFor(page, DANA)).toHaveCount(0, {
    timeout: HOLD_MS + 5_000,
  });
  await expect(section).toBeFocused();

  // The last invite left on screen.
  await deleteFor(page, RON).click();
  await expect(undoFor(page, RON)).toBeFocused();
  await expect(undoFor(page, RON)).toHaveCount(0, {
    timeout: HOLD_MS + 5_000,
  });
  await expect(desktop ? section : title).toBeFocused();
});

// A new link in place of its press: the copy button takes the focus, and
// says whose link it copies.
test("the team twin's new link puts the focus on its copy button", async ({
  page,
}) => {
  await page.goto("/design/shell/team");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: tl.newFor.replace("{name}", RON) })
    .filter({ visible: true })
    .click();
  const copy = page
    .getByRole("button", { name: tl.copy })
    .filter({ visible: true });
  await expect(copy).toBeFocused();
  await expect(copy).toHaveAccessibleDescription(
    tl.linkFor.replace("{name}", RON),
  );
});

// The invite form's answers, each heard once (as sign-in's number is): the
// first field refused takes a focus that was anywhere in the form, and why
// is said after its read, out of its description meanwhile; one the person
// put outside the form stays there, and why is said at once; the link ready
// puts the focus on its card's title; starting over, on the name.
test("the invite twin says each refusal on its field, and the link ready on its title", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  const assertive = announcer(page, "assertive");
  await page.goto("/design/shell/team/invite");
  await page.waitForLoadState("networkidle");
  const name = page.getByLabel(ti.name, { exact: true });
  const phone = page.getByLabel(ti.phone, { exact: true });

  // Sent from the number with no name: the name takes the focus.
  await phone.fill("050-123-4567");
  await heardSoFar(polite);
  await phone.press("Enter");
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(saidSince(polite, ti.errors.name.required)).toHaveCount(1);
  await expect(name).not.toHaveAttribute("aria-describedby");
  // Back on it later, why is read with it.
  await name.blur();
  await name.focus();
  await expect(name).toHaveAccessibleDescription(ti.errors.name.required);

  // A number refused, sent from that very field: the focus stays, and why
  // is said at once.
  await name.fill("תמר בדיקה");
  await phone.fill("123");
  await heardSoFar(assertive);
  await phone.press("Enter");
  await expect(saidSince(assertive, ti.errors.phone.invalid)).toHaveCount(1);
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(phone).not.toHaveAttribute("aria-describedby");

  // The focus put outside the form while the answer was on its way stays
  // there; why is said at once, and read with the field when it is reached.
  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = () => resolve();
  });
  await page.route("**/design/shell/team/invite", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  await phone.fill("");
  await heardSoFar(assertive);
  const submit = page.getByRole("button", { name: ti.submit });
  await submit.click();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  const back = page.getByRole("main").getByRole("link", { name: tt.title });
  await back.focus();
  answer();
  await expect(saidSince(assertive, ti.errors.phone.required)).toHaveCount(1);
  await expect(back).toBeFocused();
  await expect(phone).toHaveAccessibleDescription(ti.errors.phone.required);
  await page.unroute("**/design/shell/team/invite");

  // The link ready: its card's title has the focus, and says so.
  await phone.fill("050-123-4567");
  await submit.click();
  const ready = page.getByRole("heading", {
    level: 2,
    name: ti.ready.replace("{name}", "תמר בדיקה"),
  });
  await expect(ready).toBeFocused();
  await expect(
    page.getByRole("button", { name: tl.copy }),
  ).toHaveAccessibleDescription(tl.linkFor.replace("{name}", "תמר בדיקה"));

  // Someone else: a fresh form, the name ready to write.
  await page.getByRole("button", { name: ti.another }).click();
  await expect(page.getByLabel(ti.name, { exact: true })).toBeFocused();
  await expect(page.getByLabel(ti.name, { exact: true })).toHaveValue("");
});

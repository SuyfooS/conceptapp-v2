import he from "../messages/he.json" with { type: "json" };
import { announcer, heardSoFar, pastSameWords, saidSince } from "./announcer";
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

/** Where the invite test keeps what the role's alert said before, on the page's window. */
type RoleWords = { roleWords?: Node[] };

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

// A second invite deleted while the first's "ביטול" still waits (a mouse
// resting over it, the keyboard gone on): the first is sent, and its row,
// going, lets go of nothing of the second's, whose "ביטול" has the focus
// and waits past the hold.
test("the team twin's next deleted invite waits for its own 'ביטול', whatever the earlier row waited for", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/design/shell/team");
  await page.waitForLoadState("networkidle");
  await deleteFor(page, DANA).focus();
  await page.keyboard.press("Enter");
  await expect(undoFor(page, DANA)).toBeFocused();
  await deleteFor(page, RON).focus();
  await undoFor(page, DANA).hover();
  await page.keyboard.press("Enter");
  await expect(undoFor(page, RON)).toBeFocused();
  await expect(undoFor(page, DANA)).toHaveCount(0);
  // Past the hold, with the keyboard on it: still there.
  await page.waitForTimeout(HOLD_MS + 1_000);
  await expect(undoFor(page, RON)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(deleteFor(page, RON)).toBeFocused();
  await expect(deleteFor(page, DANA)).toHaveCount(0);
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
// put outside the form stays there, and why is said at once; the role's,
// the same twice, is drawn anew each time; the link ready puts the focus on
// its card's title; starting over, on the name.
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

  // A number not whole, sent from that very field: the focus stays, and
  // why is said at once. The field sends only a whole number (its hidden
  // input), so the server hears none.
  await name.fill("תמר בדיקה");
  await phone.fill("123");
  await heardSoFar(assertive);
  await phone.press("Enter");
  await expect(saidSince(assertive, ti.errors.phone.required)).toHaveCount(1);
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
  // The same words as the line just heard: past the announcer's moment for
  // them, as no one presses again sooner.
  await pastSameWords(page);
  await submit.click();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  const back = page.getByRole("main").getByRole("link", { name: tt.title });
  await back.focus();
  answer();
  await expect(saidSince(assertive, ti.errors.phone.required)).toHaveCount(1);
  await expect(back).toBeFocused();
  await expect(phone).toHaveAccessibleDescription(ti.errors.phone.required);
  await page.unroute("**/design/shell/team/invite");

  // The role refused the same way twice (none chosen): the press keeps the
  // focus, and the words are drawn anew in the list's alert each time, so
  // the second is heard as the first was.
  await phone.fill("050-123-4567");
  const roleAlert = page
    .getByRole("group", { name: ti.role, exact: true })
    .getByRole("alert");
  const noRole = () =>
    page.evaluate(() => {
      const radios =
        document.querySelectorAll<HTMLInputElement>('input[name="role"]');
      for (const radio of radios) radio.checked = false;
    });
  await noRole();
  await submit.click();
  await expect(roleAlert).toHaveText(ti.errors.role.required);
  await expect(submit).toBeFocused();
  await roleAlert.evaluate((alert) => {
    (window as unknown as RoleWords).roleWords = [...alert.childNodes];
  });
  await phone.fill("050-123-4567");
  await noRole();
  await submit.click();
  await expect
    .poll(() =>
      roleAlert.evaluate((alert) => {
        const before = (window as unknown as RoleWords).roleWords ?? [];
        return [...alert.childNodes].some((node) => !before.includes(node));
      }),
    )
    .toBe(true);
  await expect(roleAlert).toHaveText(ti.errors.role.required);
  await expect(submit).toBeFocused();

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

// A name fix on its way holds its sheet: Escape and "סגירה" wait for its
// answer, so the sheet still closes onto the fix's "ביטול", whose focus
// says what it undoes, and never onto the row with the undo unheard.
test("the person twin's name fix holds its sheet until its answer, then closes onto 'ביטול'", async ({
  page,
}) => {
  const tc = tt.changes;
  const main = page.getByRole("main");
  const nameRow = main
    .getByRole("button")
    .filter({ has: page.getByText(tc.name, { exact: true }) });
  await page.goto("/design/shell/team/noa");
  await page.waitForLoadState("networkidle");
  await nameRow.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel(ti.name, { exact: true }).fill("נועה כהן-לוי");

  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = () => resolve();
  });
  await page.route("**/design/shell/team/noa", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  const submit = sheet.getByRole("button", { name: tc.nameSubmit });
  await submit.click();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await sheet.getByRole("button", { name: tc.close }).click();
  await expect(sheet).toBeVisible();
  answer();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const changed = heT("app.team.changes.nameChanged", {
    name: "נועה כהן-לוי",
  });
  const undoName = main
    .getByRole("status")
    .filter({ hasText: changed })
    .getByRole("button", { name: he.ui.undoRow.undo });
  await expect(undoName).toBeFocused();
  await expect(undoName).toHaveAccessibleDescription(changed);
  await page.unroute("**/design/shell/team/noa");
});

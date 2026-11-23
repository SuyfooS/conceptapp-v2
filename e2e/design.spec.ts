import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createTranslator } from "next-intl";
import { FILE_TABS_TWIN_CHANNEL } from "../app/(app)/team/[person]/file/file-tabs";
import { restaurantWording } from "../app/design/order-taking/data";
import en from "../messages/en.json" with { type: "json" };
import he from "../messages/he.json" with { type: "json" };
import { daysLeftToRight } from "../packages/domain/share";
import { type MessageTree, mergeWording } from "../packages/domain/wording";
import { before, buildScreen, HOLD_MS } from "./build-screen";
import { CAPTCHA_FRAME } from "./captcha";
import { hearFileCheck } from "./file-watch";
import { minimalPdf } from "./pdf";
import { cameraPhoto } from "./photo";
import { stubAudio } from "./station-audio";
import { heT } from "./t";
import { readWorkbook, unzip } from "./unzip";

// The design system in both appearances, on the demos: no data, no sign-in.
const PAGES = [
  "/design",
  "/design/shell",
  "/design/shell/today/on-shift",
  "/design/shell/today/availability-missing",
  "/design/shell/today/owner",
  "/design/shell/today/worker",
  // The hiring file on Today (H5b): its card while something is missing,
  // and when a fund chosen later is all that is left; an account changed,
  // after "לא שיניתי", and nothing to tell (the quiet row).
  "/design/shell/today/worker?file=missing",
  "/design/shell/today/worker?file=pension",
  "/design/shell/today/worker?file=bank",
  "/design/shell/today/worker?file=disputed",
  "/design/shell/today/worker?file=complete",
  "/design/shell/today/not-published",
  "/design/shell/today/worker-not-published",
  // A worker who builds the schedule without publishing it (roles R3).
  "/design/shell/today/worker-builds",
  // A manager lowered to team none (roles R6): no team row on Today.
  "/design/shell/today/no-team",
  "/design/shell/today/scheduling-off",
  // The owner's first steps: a business a few days in, one on its first
  // day, and the team viewing as the owner.
  "/design/shell/today/first-steps",
  "/design/shell/today/first-steps?state=new",
  "/design/shell/today/first-steps?state=viewing",
  // Signed in again on the business's clock station: the reminder to lock it,
  // and a worker's card to sign out when done.
  "/design/shell/today/station",
  "/design/shell/today/station?state=worker",
  "/design/shell/schedule",
  // Next week, as the link in a shared schedule opens it.
  "/design/shell/schedule?week=2026-11-08",
  "/design/shell/schedule/worker",
  "/design/shell/schedule/swaps",
  "/design/shell/schedule/availability",
  // The team's answers, with the reminder before and after the due moment,
  // nobody sent yet, everyone sent (no reminder), and a team of no one.
  "/design/shell/schedule/availability/team",
  "/design/shell/schedule/availability/team?state=late",
  "/design/shell/schedule/availability/team?state=none",
  "/design/shell/schedule/availability/team?state=all",
  "/design/shell/schedule/availability/team?state=empty",
  "/design/shell/schedule/build",
  "/design/shell/schedule/build?state=meanwhile",
  "/design/shell/schedule/build?week=2026-11-01",
  // Building without publishing (roles R3): a draft, and a published week read.
  "/design/shell/schedule/build?publishes=no",
  "/design/shell/schedule/build?state=meanwhile&publishes=no",
  "/design/shell/schedule/build/running",
  "/design/shell/schedule/build/running?week=next",
  // Next week saved as a draft, with people on Sunday: a copy keeps it.
  "/design/shell/schedule/build/running?week=next&state=draft",
  "/design/shell/schedule/shifts",
  "/design/shell/schedule/shifts?at=evening",
  "/design/shell/clock",
  "/design/shell/clock?estimate=off",
  "/design/shell/clock?state=working",
  "/design/shell/clock?state=break",
  "/design/shell/clock?state=left",
  "/design/shell/clock?code=on",
  "/design/shell/clock?state=working&code=on",
  "/design/shell/clock/code",
  // The clock station (#78 phase 5): running, refused a code while running,
  // a device that isn't one, one stopped, and someone signed in on it who
  // locks it again, can't with ten running, or doesn't.
  "/design/shell/station",
  "/design/shell/station?state=clockOff",
  "/design/shell/station?state=managerOnly",
  "/design/shell/station?state=new",
  "/design/shell/station?state=stopped",
  "/design/shell/station?state=signedIn",
  "/design/shell/station?state=signedInFull",
  "/design/shell/station?state=signedInWorker",
  "/design/shell/clock/history",
  "/design/shell/clock/history?state=empty",
  "/design/shell/clock/history?estimate=off",
  "/design/shell/clock/team",
  "/design/shell/clock/team/noa",
  "/design/shell/clock/team/yoav",
  // A shift being fixed with "ביטול המשמרת" under it, the step that cancels
  // it, and a cancelled one to bring back (the clock plan's PR4); Noa's was
  // still open when it was cancelled.
  "/design/shell/clock/team/yoav?state=edit",
  "/design/shell/clock/team/yoav?state=cancel",
  "/design/shell/clock/team/yoav?state=cancelled",
  "/design/shell/clock/team/noa?state=cancelled",
  // Fixing a break (the clock plan's PR5): one that ended, adding one, and a
  // shift whose break still runs.
  "/design/shell/clock/team/yoav?state=break",
  "/design/shell/clock/team/yoav?state=addBreak",
  "/design/shell/clock/team/yoav?state=openBreak",
  "/design/shell/clock/pay",
  "/design/shell/clock/pay?person=yoav",
  "/design/shell/clock/pay?show=noWage",
  "/design/shell/clock/pay?show=noNumber",
  "/design/shell/clock/pay?estimate=off",
  "/design/shell/clock/pay?person=yoav&estimate=off",
  "/design/shell/clock/pay?file=sent",
  "/design/shell/clock/pay?file=changed",
  "/design/shell/clock/pay?close=closed",
  "/design/shell/clock/pay?close=changed",
  "/design/shell/clock/pay?close=manager",
  "/design/shell/clock/pay?close=before",
  "/design/shell/clock/pay?close=empty",
  "/design/shell/clock/pay/noa",
  "/design/shell/clock/pay/noa?close=closed",
  "/design/shell/clock/pay/noa?estimate=off",
  "/design/shell/clock/pay/shiran",
  "/design/shell/clock/pay/yoav",
  "/design/shell/clock/pay/yoav?estimate=off",
  "/design/shell/clock/pay/maya",
  "/design/shell/today/accountant",
  "/design/shell/today/accountant?estimate=off",
  "/design/shell/today/accountant?state=checked",
  "/design/shell/today/accountant?state=empty",
  "/design/shell/today/accountant?state=off",
  // The accountant signed in on the business's clock station: sign out when done.
  "/design/shell/today/accountant?state=station",
  // The staff's hiring files on the accountant's Home (profile H6a).
  "/design/shell/today/accountant?files=missing",
  "/design/shell/today/accountant?files=complete",
  "/design/shell/today/businesses",
  "/design/shell/today/businesses?state=left",
  "/design/shell/team",
  "/design/shell/team?state=demo",
  // A worker raised to see the team without editing it (roles R6).
  "/design/shell/team?state=view",
  "/design/shell/team/noa",
  "/design/shell/team/maya",
  "/design/shell/team/noa?state=clocked",
  "/design/shell/team/noa?state=former",
  // Someone nobody named: the title and the name row read "בלי שם".
  "/design/shell/team/noa?state=nameless",
  "/design/shell/team/uri?as=manager",
  "/design/shell/team/noa?as=viewer",
  // A worker raised to edit the team, who doesn't read the hours, and a
  // manager where managers hold pay (roles R6).
  "/design/shell/team/noa?as=editor",
  "/design/shell/team/noa?as=manager&state=pay",
  "/design/shell/team/invite?as=editor",
  "/design/shell/team/invite?as=paid",
  // Every role an owner's, for pay and for what it holds (roles R11c).
  "/design/shell/team/invite?as=held",
  // The hiring file's lines and card for a holder, a manager and the
  // accountant (files only), and a holder's file in each state (H6a).
  "/design/shell/team?file=holder",
  "/design/shell/team?file=manager",
  "/design/shell/team?file=accountant",
  "/design/shell/team/yoav?file=holder",
  "/design/shell/team/yoav?file=manager",
  "/design/shell/team/yoav?file=view",
  "/design/shell/team/noa?file=holder",
  "/design/shell/team/noa/file?state=duties",
  "/design/shell/team/noa/file?state=locked",
  "/design/shell/team/noa/file?state=code",
  // The locked file in the week after the holder's own phone change.
  "/design/shell/team/noa/file?state=held",
  // The "אני לא רובוט" check before the code (P9b), in its stand-in's
  // states: failed on the locked file, asking for a tick on the code's card.
  "/design/shell/team/noa/file?state=locked&captcha=failed",
  "/design/shell/team/noa/file?state=code&captcha=tap",
  "/design/shell/team/noa/file?state=open",
  "/design/shell/team/noa/file?state=viewing",
  "/design/shell/team/noa/file?state=unavailable",
  "/design/shell/team/noa/file?state=review",
  "/design/shell/team/noa/file?state=open&as=accountant",
  "/design/shell/team/yoav/file?state=open",
  // What a holder does in the file (H6b-1): an account to look at of each
  // kind, one changed again meanwhile, "מה קרה בתיק" empty and unread, a
  // part handed directly, a pension whose day passed; the profile's card of
  // someone who said "לא שיניתי"; the owner's Today with the accounts to
  // look at. And (H6b-2) a minor's checklist.
  "/design/shell/team/noa/file?state=review-new",
  "/design/shell/team/noa/file?state=review-warned",
  "/design/shell/team/noa/file?state=moved",
  "/design/shell/team/noa/file?state=open&history=empty",
  "/design/shell/team/noa/file?state=open&history=failed",
  "/design/shell/team/yoav/file?state=open&direct=bank",
  "/design/shell/team/yoav/file?state=passed",
  "/design/shell/team/maya/file?state=open",
  "/design/shell/team/itay?file=holder",
  "/design/shell/today/owner?files=reviews",
  "/design/shell/me",
  "/design/shell/me?state=empty",
  "/design/shell/me?state=demo",
  // The hiring file's way in from the profile (H5a): the card and the rows,
  // and every part in.
  "/design/shell/me?file=missing",
  "/design/shell/me?file=done",
  // What each business asks (H5b): neither the address nor the account,
  // and the ways to reach her instead, with the contact's row.
  "/design/shell/me?file=lean",
  "/design/shell/me?file=contact",
  // Sent, with a pension fund chosen later all that is left.
  "/design/shell/me?file=later",
  // A business she left whose old file she can read (H5c).
  "/design/shell/me?past=1",
  "/design/shell/me/businesses",
  // The worker's own file (H5a) on Noa's twin: stopped at the account, each
  // step, a minor's birth date, an account the check warns about and its
  // code, an account saved, everything sent, nothing yet (the welcome), and
  // in English.
  "/design/shell/me/file",
  "/design/shell/me/file?step=start",
  "/design/shell/me/file?step=identity",
  "/design/shell/me/file?step=identity&state=minor",
  "/design/shell/me/file?step=address",
  "/design/shell/me/file?step=bank",
  "/design/shell/me/file?step=bank&state=warning",
  "/design/shell/me/file?step=bank&state=code",
  "/design/shell/me/file?step=bank&state=hold",
  "/design/shell/me/file?step=bank&state=saved",
  // The check before the bank's code: didn't load, failed on the code's
  // card, and asking for a tick in English.
  "/design/shell/me/file?step=bank&captcha=unavailable",
  "/design/shell/me/file?step=bank&state=code&captcha=failed",
  "/design/shell/me/file?lang=en&step=bank&captcha=tap",
  "/design/shell/me/file?step=pension",
  "/design/shell/me/file?step=form101",
  "/design/shell/me/file?state=done",
  "/design/shell/me/file?state=new",
  "/design/shell/me/file?lang=en",
  "/design/shell/me/file?lang=en&step=bank",
  // What each business asks (H5b): the steps that leave out the address and
  // the account; step 2 as the ways to reach her, filled and not; the address
  // and the account no longer asked but held; Form 101 by an approved
  // system's link, in both languages; and not in the app, so the done screen
  // sends the file.
  "/design/shell/me/file?ask=lean",
  "/design/shell/me/file?ask=lean&state=done",
  "/design/shell/me/file?ask=contact&step=address",
  "/design/shell/me/file?ask=contact&state=done",
  "/design/shell/me/file?ask=held&state=ready&step=address",
  "/design/shell/me/file?ask=held&state=ready&step=bank",
  "/design/shell/me/file?form101=link&step=form101",
  "/design/shell/me/file?form101=link&lang=en&step=form101",
  "/design/shell/me/file?form101=off",
  "/design/shell/me/file?form101=off&state=ready",
  "/design/shell/me/file?form101=off&state=done",
  // Sent with a fund still to choose: the done screen leads to the pension.
  "/design/shell/me/file?state=later",
  "/design/shell/manage",
  // Someone at view on the management page (roles R7), and a module's
  // settings without the module's own edit.
  "/design/shell/manage?state=view",
  "/design/shell/manage/notifications?state=view",
  "/design/shell/manage/scheduling?state=module",
  "/design/shell/manage/business?state=view",
  "/design/shell/manage/departments?state=view",
  // A manager lowered to team none (roles R6): no team row, and none to the
  // owner's roles and pay.
  "/design/shell/manage?state=noTeam",
  "/design/shell/manage/business",
  "/design/shell/manage/activity",
  "/design/shell/manage/activity/empty",
  "/design/shell/manage/scheduling",
  "/design/shell/manage/time_clock",
  "/design/shell/manage/lists",
  "/design/shell/manage/notifications",
  // How full the spaces for files are, above chat's settings (bigger
  // teams): quiet, filling, and the documents' full.
  "/design/shell/manage/chat",
  "/design/shell/manage/chat?space=near",
  "/design/shell/manage/chat?space=full",
  // What the hiring file asks, as its owner sets it (H5b).
  "/design/shell/manage/employee_files",
  "/design/shell/manage/departments",
  "/design/shell/manage/access",
  // Workers see pay too, and the shift lead still only by his own (R11e).
  "/design/shell/manage/access?state=named",
  "/design/shell/manage/roles",
  // The role the business named, opened first: on a phone, its own screen.
  "/design/shell/manage/roles?role=shift-lead",
  // Orel's case (L6b-2): "עובד בכיר" on workers, lists at view with fixing
  // closed lists on, also opened first.
  "/design/shell/manage/roles?state=senior",
  "/design/shell/manage/roles?state=senior&role=senior",
  "/design/shell/lists",
  "/design/shell/lists?sent=list-floor-opening",
  "/design/shell/lists?department=dep-bar",
  "/design/shell/lists?passed=dep-storeroom",
  "/design/shell/lists/worker",
  // A worker raised to lists edit without sending (R5): who sends.
  "/design/shell/lists/worker?state=edits",
  // Given fixing closed lists (L6b-2): yesterday's list still to fix.
  "/design/shell/lists/worker?state=fixable",
  "/design/shell/lists/empty",
  "/design/shell/lists/empty?as=business",
  "/design/shell/lists/list-kitchen-opening",
  "/design/shell/lists/list-kitchen-opening?state=finished",
  "/design/shell/lists/list-bar-order",
  "/design/shell/lists/list-bar-order?state=passed",
  "/design/shell/lists/list-kitchen-closing-mon",
  "/design/shell/lists/list-weekly-cleaning",
  "/design/shell/lists/list-weekly-cleaning?state=photo",
  "/design/shell/lists/list-weekly-cleaning?state=demo",
  "/design/shell/lists/list-weekly-cleaning?state=gone",
  // Each item's story (L6a): a reading changed after another's, a tick
  // taken back, and a list opened again and closed.
  "/design/shell/lists/list-kitchen-opening?state=history",
  "/design/shell/lists/list-weekly-cleaning?state=history",
  // A closed list fixed in place (L6b-1): being fixed, with its card, and
  // fixed, with its marks, also on the manager's day.
  "/design/shell/lists/list-kitchen-opening?state=fix",
  "/design/shell/lists/list-kitchen-opening?state=fixed",
  "/design/shell/lists/today?state=fixed",
  // The same close for someone given fixing closed lists (L6b-2), for a day.
  "/design/shell/lists/list-kitchen-opening?state=fix-worker",
  // A list to a role the business named (R11d).
  "/design/shell/lists/list-shift-opening",
  "/design/shell/lists/today",
  "/design/shell/lists/today?day=2026-11-01",
  "/design/shell/lists/today?state=empty",
  "/design/shell/lists/today?state=viewing",
  "/design/shell/lists/today?state=noSend",
  "/design/shell/lists/today?state=emptyNoSend",
  "/design/shell/lists/today?state=shiftGone",
  "/design/shell/lists/send",
  "/design/shell/lists/send?template=new",
  "/design/shell/lists/send?template=t-weekly-cleaning",
  "/design/shell/lists/send?template=t-bar-order",
  "/design/shell/lists/send?state=kitchenGone",
  "/design/shell/lists/send?template=t-shift-opening",
  "/design/shell/lists/send?template=t-shift-opening&state=roleGone",
  "/design/shell/lists/templates",
  "/design/shell/lists/templates?removed=t-stock-count",
  "/design/shell/lists/templates?state=empty",
  "/design/shell/lists/templates?as=viewing",
  "/design/shell/lists/templates?state=empty&as=viewing",
  "/design/shell/lists/templates/t-kitchen-opening",
  "/design/shell/lists/templates/t-kitchen-opening?changed=1",
  "/design/shell/lists/templates/t-kitchen-opening?as=viewing",
  "/design/shell/lists/templates/t-bar-order",
  "/design/shell/lists/templates/t-bar-order?state=barGone",
  "/design/shell/lists/templates/t-bar-closing",
  "/design/shell/lists/templates/t-bar-closing?state=shiftGone",
  "/design/shell/lists/templates/t-weekly-cleaning",
  "/design/shell/lists/templates/t-weekly-cleaning?state=demo",
  "/design/shell/lists/templates/t-shift-opening",
  "/design/shell/lists/templates/t-shift-opening?state=roleGone",
  "/design/shell/lists/templates/t-stock-count",
  "/design/shell/lists/templates/new",
  "/design/shell/notifications",
  "/design/shell/notifications/empty",
  "/design/shell/notifications/settings",
  "/design/shell/notifications/settings?state=quiet",
  "/design/shell/notifications/settings?state=demo",
  // Waiter mode P8b: the lines about orders, and their group with the line
  // about quiet hours during a shift.
  "/design/shell/notifications/orders",
  "/design/shell/notifications/settings?state=orders",
  "/design/chat",
  "/design/chat?state=empty",
  "/design/chat?state=demo",
  "/design/chat/team",
  "/design/chat/team?state=confirmed",
  "/design/chat/team?state=readers",
  "/design/chat/team?state=actions",
  "/design/chat/team?announce=1",
  "/design/chat/team/info",
  "/design/chat/kitchen/info",
  "/design/chat/noa/info",
  "/design/chat/announcements",
  "/design/chat/announcements?announces=no",
  "/design/chat/floor",
  "/design/chat/kitchen",
  "/design/chat/kitchen?state=photo",
  "/design/chat/kitchen?state=attach",
  "/design/chat/kitchen?state=uploading",
  "/design/chat/kitchen?state=pdfFailed",
  // One person's PDFs of the last minutes past half the space (sec-files).
  "/design/chat/kitchen?state=pdfOwn",
  "/design/chat/desserts",
  "/design/chat/noa",
  "/design/chat/noa?state=failed",
  "/design/chat/uri",
  "/design/chat/documents",
  "/design/chat/documents?state=seen",
  "/design/chat/documents?person=noa",
  "/design/chat/documents?state=empty",
  "/design/chat/documents?as=staff",
  "/design/chat/documents?as=staff&state=empty",
  "/design/chat/documents?as=manager",
  "/design/chat/documents?as=manager&state=noSend",
  // The space for documents filling or full (bigger teams): told to the
  // office and a sender above every shape.
  "/design/chat/documents?space=near",
  "/design/chat/documents?space=full",
  "/design/chat/documents?as=manager&space=near",
  "/design/chat/documents/send",
  "/design/chat/documents/send?to=people",
  "/design/chat/documents/send?state=demo",
  // To people with the space full, and "כל הצוות" more than one document
  // takes (bigger teams).
  "/design/chat/documents/send?to=people&space=full",
  "/design/chat/documents/send?to=people&state=tooMany",
  "/design/chat/documents/sick-note",
  "/design/chat/documents/sick-note?state=remove",
  "/design/chat/documents/sick-note?state=removed",
  "/design/chat/documents/sick-note?as=staff&state=sent",
  "/design/chat/documents/procedure",
  "/design/chat/documents/procedure?as=manager",
  "/design/chat/documents/payslip?as=staff",
  "/design/chat/documents/maya-other",
  "/design/console/businesses/demo-restaurant/settings",
  "/design/console/businesses/demo-restaurant/lists",
  "/design/console/businesses/demo-restaurant/lists/t-kitchen-opening",
  "/design/console/businesses/demo-restaurant/access",
  "/design/console/businesses/demo-restaurant/access?state=readOnly",
  // Roles and permissions from the console (R2): scheduling (R3), the time
  // clock (R4), lists (R5), the team (R6) and the management page (R7) open
  // and the rest closed, then every area open as each phase will open it,
  // and a team role that only reads.
  "/design/console/businesses/demo-restaurant/roles",
  "/design/console/businesses/demo-restaurant/roles?state=open",
  "/design/console/businesses/demo-restaurant/roles?state=readOnly",
  "/design/console/businesses/demo-restaurant/roles?state=lists",
  // A business nobody has joined yet: only an invite, and one that ran out.
  "/design/console/businesses/bar-hayam/access",
  // Waiter mode's mock screens (S0, #191): each screen and state the twin's
  // list names, the stations outside the mode's shell included.
  "/design/order-taking",
  "/design/order-taking/floor",
  "/design/order-taking/floor?state=quiet",
  "/design/order-taking/floor?state=offClock",
  "/design/order-taking/floor?state=staleShift",
  "/design/order-taking/floor?state=readyNow",
  "/design/order-taking/floor?state=noPlaces",
  "/design/order-taking/floor?state=viewing",
  "/design/order-taking/floor/order?place=table-6",
  "/design/order-taking/floor/order?place=table-6&state=draft",
  "/design/order-taking/floor/order?place=table-6&state=sent",
  "/design/order-taking/floor/order?place=table-6&state=pending",
  // P7: a round that asks after ten minutes, no connection, and the notice
  // of a round taken off the phone.
  "/design/order-taking/floor/order?place=table-6&state=asking",
  "/design/order-taking/floor?state=asking",
  "/design/order-taking/floor/order?place=table-6&state=offline",
  "/design/order-taking/floor?state=offline",
  "/design/order-taking/floor?state=lost",
  "/design/order-taking/floor/order?place=table-6&state=soldOut",
  "/design/order-taking/floor/order?place=table-6&state=taken",
  // P6: the burger's choices open, and a choice gone from the menu.
  "/design/order-taking/floor/order?place=table-6&state=choices",
  "/design/order-taking/floor/order?place=table-6&state=choicesChanged",
  "/design/order-taking/floor/order?place=table-4",
  "/design/order-taking/floor/order?place=takeaway-new",
  "/design/order-taking/floor/order?order=order-takeaway-1",
  "/design/order-taking/floor/till?order=order-4",
  "/design/order-taking/floor/till?order=order-4&state=byRound",
  "/design/order-taking/floor/till?order=order-3",
  // P5's fixes: table 4 after a cancel and a beer on the house, its till, a
  // takeaway cancelled whole, a reopen refused while the table is taken, the
  // kitchen striking the cancelled dish, and the owner's line.
  "/design/order-taking/floor/order?place=table-4&state=fixed",
  "/design/order-taking/floor/till?order=order-4&state=fixed",
  "/design/order-taking/floor/till?order=order-takeaway-2",
  "/design/order-taking/floor/till?order=order-3&state=reopenTaken",
  "/design/order-taking/prep?state=fixed",
  "/design/shell/manage/order_taking",
  "/design/order-taking/mine",
  "/design/order-taking/mine?state=nothingSent",
  // P8b: a kitchen screen running that never fetched table 4's starters.
  "/design/order-taking/floor/order?place=table-4&state=screenOff",
  "/design/order-taking/mine?state=screenOff",
  "/design/order-taking/prep",
  "/design/order-taking/prep?state=nothingOpen",
  "/design/order-taking/prep?state=kitchen",
  // The kitchen's and the till's stations (P8a), the real screens on the
  // twin: the gate, open, a ticket arriving, waiting too long, struck,
  // "מה נגמר", every department, offline, the sound stopped, nothing open
  // and stopped; the till, an order chosen, held, closed and offline; the
  // prep screen with ten devices locked; and Home on the kitchen's screen.
  // The timed states are checked clean, not waited on.
  "/design/order-taking/station/prep",
  "/design/order-taking/station/prep?state=open",
  "/design/order-taking/station/prep?state=arrives",
  "/design/order-taking/station/prep?state=late",
  "/design/order-taking/station/prep?state=struck",
  "/design/order-taking/station/prep?state=soldOut",
  "/design/order-taking/station/prep?state=allDepartments",
  "/design/order-taking/station/prep?state=offline",
  "/design/order-taking/station/prep?state=soundLocked",
  "/design/order-taking/station/prep?state=nothingOpen",
  "/design/order-taking/station/prep?state=stopped",
  "/design/order-taking/station/till",
  "/design/order-taking/station/till?state=chosen",
  "/design/order-taking/station/till?state=held",
  "/design/order-taking/station/till?state=closed",
  "/design/order-taking/station/till?state=offline",
  "/design/order-taking/prep?state=fullStations",
  "/design/shell/today/station?state=prep",
  "/design/order-taking/menu",
  "/design/order-taking/menu?state=noMenu",
  "/design/order-taking/menu/import",
  // The real menu screens on the twin (P2): Yoav in the bar, a category whose
  // department went, a view as a manager, the categories, the places and a
  // business with none, and pastes with lines to fix and with items there
  // already; and the departments saying what each prepares.
  "/design/order-taking/menu?state=worker",
  "/design/order-taking/menu?state=noRoute",
  "/design/order-taking/menu?state=viewing",
  "/design/order-taking/menu/categories",
  "/design/order-taking/menu/categories?state=noDepartments",
  "/design/order-taking/menu/places",
  "/design/order-taking/menu/places?state=noPlaces",
  "/design/order-taking/menu/import?state=problems",
  "/design/order-taking/menu/import?state=known",
  "/design/shell/manage/departments?state=menu",
  "/design/shell/manage/departments?state=menuEmpty",
];

// The chat demo's states that open with a sheet (who confirmed, a message's
// actions, a picture shown whole, the attach sheet, a document's removal
// with its reasons), a person's hours on the clock demo open on a shift,
// and waiter mode's order opens on an item's choices, and its kitchen's
// screen on "מה נגמר": the sheet hides the page behind it from the
// accessibility tree. Lists' `?state=photo` opens none.
const OPENS_A_SHEET =
  /^\/design\/(chat\/.*[?&]state=(readers|actions|photo|attach|remove)|shell\/clock\/team\/[^?]+[?&]state=(edit|cancel|cancelled|break|addBreak|openBreak)|order-taking\/floor\/order\?.*[?&]state=choices|order-taking\/station\/prep\?(?:.*&)?state=soldOut)\b/;

async function expectCleanPage(
  page: Page,
  path = "",
  sheet = OPENS_A_SHEET.test(path),
) {
  await expect(page).toHaveTitle(/ConceptApp$/);
  // The title can arrive before a demo's streamed part: check the page itself,
  // or the sheet it opens with (or a test opened), checked once it is there.
  if (sheet) {
    await expect(page.getByRole("dialog")).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
    ).toBeVisible();
  }
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary}`),
    ),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    for (const path of PAGES) {
      test(`${path} is clean`, async ({ page }) => {
        await page.goto(path);
        await expectCleanPage(page, path);
      });
    }

    test("the page follows the device", async ({ page }) => {
      await page.goto("/design");
      const color = await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      );
      expect(color).toBe(
        colorScheme === "dark" ? "rgb(8, 9, 11)" : "rgb(238, 239, 242)",
      );
    });
  });
}

// The chat's mock screens (C2). On a phone a conversation takes the whole
// screen: no tab bar, the composer in its place, and the list it goes back to
// has its bar again (the conversation kept hidden for going back must not
// hide it). From tablet up the list stays beside the conversation, and the
// desktop adds its details. What is sent goes on its way and is answered.
test("the chat demo hides the phone's tab bar in a conversation, and sends", async ({
  page,
}, testInfo) => {
  const c = he.app.chat;
  const phone = testInfo.project.name === "phone";
  const desktop = testInfo.project.name === "desktop";
  const bar = page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
  const visible = (name: string | RegExp) =>
    page.getByRole("link", { name }).filter({ visible: true }).first();

  await page.goto("/design/chat");
  await expect(
    page.getByRole("heading", { level: 1, name: he.modules.chat.name }),
  ).toBeVisible();
  await expect(bar).toHaveCount(1);
  if (!phone) {
    await expect(
      page.getByRole("heading", { name: c.list.choose.title }),
    ).toBeVisible();
  }

  await visible(/נועה כהן/).click();
  await expect(page).toHaveURL(/\/design\/chat\/noa$/);
  await expect(
    page
      .getByRole("heading", { level: 1, name: "נועה כהן" })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText(c.conversation.privateNote).filter({ visible: true }),
  ).toHaveCount(desktop ? 2 : 1);
  // The phone's bar steps aside; the tablet keeps it, the desktop its sidebar.
  await expect(bar).toHaveCount(phone ? 0 : 1);
  await expect(
    page
      .getByRole("heading", { name: c.list.people })
      .filter({ visible: true }),
  ).toHaveCount(phone ? 0 : 1);
  await expect(page.getByRole("region", { name: c.details.label })).toBeVisible(
    { visible: desktop },
  );

  const field = page
    .getByRole("textbox", { name: c.conversation.placeholder })
    .filter({ visible: true });
  const send = page
    .getByRole("button", { name: c.conversation.send, exact: true })
    .filter({ visible: true });
  await expect(send).toBeDisabled();
  await field.fill("נתראה בשש");
  await send.click();
  await expect(field).toHaveValue("");
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  await expect(log.getByText("נתראה בשש")).toBeVisible();
  await expect(log.getByText("תודה רבה")).toBeVisible({ timeout: 10_000 });
  await expect(log.getByText(c.conversation.sending)).toHaveCount(0);
  await expect(log.getByText(c.conversation.seen)).toHaveCount(1);

  if (phone) {
    await visible(c.conversation.back).click();
  } else {
    await visible(/כל הצוות/).click();
  }
  await expect(page).toHaveURL(
    phone ? /\/design\/chat$/ : /\/design\/chat\/team$/,
  );
  await expect(bar).toHaveCount(1);
});

// A message that didn't go says so under it, and goes when tried again; a
// removed department reads, and says why nothing can be written.
test("the chat demo retries a message, and a removed department takes none", async ({
  page,
}) => {
  const c = he.app.chat;
  await page.goto("/design/chat/noa?state=failed");
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  await log.getByRole("button", { name: c.conversation.failed }).click();
  await expect(log.getByText(c.conversation.sending)).toBeVisible();
  await expect(
    log.getByRole("button", { name: c.conversation.failed }),
  ).toHaveCount(0);
  await expect(log.getByText(c.conversation.sending)).toHaveCount(0);

  await page.goto("/design/chat/desserts");
  await expect(
    page.getByText(c.conversation.closed).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("textbox", { name: c.conversation.placeholder })
      .filter({ visible: true }),
  ).toHaveCount(0);
});

// The whole team's group with the owner's announcement pinned (C3), in each
// shape: "קראתי" is counted, who confirmed opens, and a message management
// removes comes back from the toast. A phone and a tablet open a message's
// actions with a tap on it; a desktop with its button, shown while the
// pointer is on the message, and its details column mutes the group.
test("the chat demo confirms the pinned announcement, and a removed message comes back", async ({
  page,
}, testInfo) => {
  const c = he.app.chat;
  const desktop = testInfo.project.name === "desktop";
  const words = "אני כבר פה, אקבל אותו";
  const readBy = (count: number) =>
    new RegExp(
      `^${c.announcement.readBy
        .replace("<ltr>{count}</ltr>", String(count))
        .replace("<ltr>{total}</ltr>", "\\d+")}$`,
    );
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  const visibleButton = (name: string | RegExp) =>
    page
      .getByRole("button", {
        name,
        exact: typeof name === "string" ? true : undefined,
      })
      .filter({ visible: true });

  await page.goto("/design/chat/team");
  await expect(
    page
      .getByRole("heading", { level: 2, name: c.announcement.label })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText(c.announcement.whoSees).filter({ visible: true }),
  ).toBeVisible();
  await expect(visibleButton(readBy(2))).toBeVisible();
  await visibleButton(c.announcement.confirm).click();
  await expect(
    page.getByText(c.announcement.confirmed).filter({ visible: true }),
  ).toBeVisible();
  await expect(visibleButton(c.announcement.confirm)).toHaveCount(0);
  await expect(visibleButton(readBy(3))).toBeVisible();

  await visibleButton(readBy(3)).click();
  const readers = page.getByRole("dialog", {
    name: c.announcement.readers.title,
  });
  await expect(
    readers.getByRole("heading", {
      name: c.announcement.readers.confirmed,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    readers.getByRole("heading", {
      name: c.announcement.readers.waiting,
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(readers).toHaveCount(0);

  // Someone else's message: management copies or removes it.
  if (desktop) {
    const bubble = page.locator("[data-bubble]").filter({ hasText: words });
    await bubble.hover();
    await bubble.getByRole("button", { name: c.messageActions.open }).click();
  } else {
    await log.getByText(words, { exact: true }).click();
  }
  const sheet = page.getByRole("dialog", { name: c.messageActions.title });
  await expect(
    sheet.getByRole("button", {
      name: new RegExp(`^${c.messageActions.copy}`),
    }),
  ).toBeVisible();
  await sheet
    .getByRole("button", { name: new RegExp(`^${c.messageActions.remove}`) })
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(log.getByText(c.message.removedByManager)).toBeVisible();
  await expect(log.getByText(words, { exact: true })).toHaveCount(0);
  const removed = page
    .getByRole("status")
    .filter({ hasText: c.messageActions.removed });
  await removed.getByRole("button", { name: c.messageActions.undo }).click();
  await expect(
    page.getByRole("status").filter({ hasText: c.messageActions.restored }),
  ).toBeVisible();
  await expect(log.getByText(words, { exact: true })).toBeVisible();
  await expect(log.getByText(c.message.removedByManager)).toHaveCount(0);

  // The details column, on a desktop only, mutes the group.
  const mute = page
    .getByRole("switch", { name: c.info.mute })
    .filter({ visible: true });
  await expect(mute).toHaveCount(desktop ? 1 : 0);
  if (desktop) {
    await mute.click();
    await expect(mute).toBeChecked();
  }
});

// A conversation's details from its title (C3): on a phone their own page,
// on a tablet a sheet over the conversation, which gives the focus back to
// the button once closed, on a desktop the column beside it. The
// announcements' main action asks for the group and opens its composer as
// "הודעה מההנהלה".
test("the chat demo opens a group's details from its title, and posts as management", async ({
  page,
}, testInfo) => {
  const c = he.app.chat;
  const phone = testInfo.project.name === "phone";
  const desktop = testInfo.project.name === "desktop";
  const visible = (locator: Locator) => locator.filter({ visible: true });

  await page.goto("/design/chat/team");
  if (phone) {
    await visible(
      page.getByRole("link", { name: c.info.open, exact: true }),
    ).click();
    await expect(page).toHaveURL(/\/design\/chat\/team\/info$/);
    await expect(
      page.getByRole("heading", { level: 1, name: c.info.open }),
    ).toBeVisible();
    await expect(
      visible(page.getByRole("switch", { name: c.info.mute })),
    ).toHaveCount(1);
    await visible(page.getByRole("link", { name: c.info.back })).click();
    await expect(page).toHaveURL(/\/design\/chat\/team$/);
  } else if (!desktop) {
    const open = visible(
      page.getByRole("button", { name: c.info.open, exact: true }),
    );
    await open.click();
    const sheet = page.getByRole("dialog", { name: c.info.open });
    await expect(
      sheet.getByRole("switch", { name: c.info.mute }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("heading", { name: c.details.members }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(open).toBeFocused();
  } else {
    await expect(
      visible(page.getByRole("button", { name: c.info.open, exact: true })),
    ).toHaveCount(0);
    await expect(
      visible(page.getByRole("link", { name: c.info.open, exact: true })),
    ).toHaveCount(0);
  }

  await page.goto("/design/chat/announcements");
  await expect(
    page.getByRole("heading", { level: 1, name: c.announcement.page.title }),
  ).toBeVisible();
  await visible(
    page.getByRole("button", { name: c.announcement.page.publish }),
  ).click();
  const choose = page.getByRole("dialog", {
    name: c.announcement.page.chooseGroup,
  });
  await choose.getByRole("link", { name: c.list.team, exact: true }).click();
  await expect(page).toHaveURL(/\/design\/chat\/team\?announce=1$/);
  await expect(
    visible(page.getByRole("switch", { name: c.announcement.switch })),
  ).toBeChecked();
  await expect(
    visible(
      page.getByRole("button", { name: c.announcement.send, exact: true }),
    ),
  ).toBeVisible();

  // Moderating without announcing (the roles plan's R8): no main action,
  // and the line says who posts them.
  await page.goto("/design/chat/announcements?announces=no");
  await expect(
    visible(page.getByText(c.announcement.page.noAnnounce)),
  ).toBeVisible();
  await expect(
    visible(page.getByRole("button", { name: c.announcement.page.publish })),
  ).toHaveCount(0);
});

/**
 * A phone's keyboard, faked: Playwright opens none, so this shrinks
 * `window.visualViewport` by `height` (0 gives it back) and sends the resize
 * a keyboard sends. Nothing else changes: the layout viewport stays as iOS
 * leaves it, and Android Chrome by default.
 */
async function fakeKeyboard(page: Page, height: number) {
  await page.evaluate((keyboard) => {
    const view = window.visualViewport;
    if (!view) throw new Error("no visualViewport");
    Reflect.deleteProperty(view, "height");
    if (keyboard > 0) {
      const left = view.height - keyboard;
      Object.defineProperty(view, "height", {
        configurable: true,
        get: () => left,
      });
    }
    view.dispatchEvent(new Event("resize"));
  }, height);
}

// Sheets stand over the phone's keyboard (Orel, 22 November 2026): with a
// keyboard faked over the foot of the screen, the chat's new message sheet
// stands 8px over it, no taller than what is left above it, with its search
// field in sight and the page behind it where it was; once the keyboard
// closes, the sheet is back at the foot.
test("a sheet stands over the phone's keyboard (faked), its field in sight", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "a phone's keyboard");
  const c = he.app.chat;
  const keyboard = 320;
  await page.goto("/design/chat");
  await page
    .getByRole("button", { name: c.list.newMessage, exact: true })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", { name: c.list.newMessage });
  await expect(sheet).toBeVisible();
  const height = page.viewportSize()?.height ?? 0;
  const foot = async () => {
    const box = await sheet.boundingBox();
    return box ? Math.round(box.y + box.height) : null;
  };
  await expect.poll(foot).toBe(height - 8);

  const field = sheet.getByRole("searchbox", { name: c.newMessage.search });
  await field.focus();
  const scrolled = await page.evaluate(() => window.scrollY);
  await fakeKeyboard(page, keyboard);
  const above = height - keyboard;
  await expect.poll(foot).toBe(above - 8);
  expect((await sheet.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(7);
  const typed = await field.boundingBox();
  expect((typed?.y ?? 0) + (typed?.height ?? 0)).toBeLessThanOrEqual(above);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

  await fakeKeyboard(page, 0);
  await expect.poll(foot).toBe(height - 8);
});

// A shift that has begun is no longer given away, as the database refuses
// it: Noa's Tuesday evening offers it at noon, and at 17:30, an hour and a
// half into it, neither its hero nor its sheet does.
test("the shifts demo offers no giving away once the shift has begun", async ({
  page,
}) => {
  const sw = he.app.shifts.swap;
  const evening = heT("app.shifts.shift", {
    name: "ערב",
    day: he.app.availability.weekdays.tue,
    date: "3.11",
  });
  const give = page
    .getByRole("button", { name: `${sw.buttons.give}, ${evening}` })
    .filter({ visible: true });

  await page.goto("/design/shell/schedule/shifts");
  await expect(give).toHaveCount(1);

  await page.goto("/design/shell/schedule/shifts?at=evening");
  const hero = page.getByRole("region", { name: evening, exact: true });
  await expect(hero).toContainText(he.app.shifts.yours);
  await expect(give).toHaveCount(0);
  await hero
    .getByRole("button", {
      name: heT("app.shifts.board.open", { shift: evening }),
    })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toContainText(he.app.shifts.sheet.give);
  await expect(
    sheet.getByRole("button", { name: new RegExp(`^${sw.buttons.give}, `) }),
  ).toHaveCount(0);
});

// A request whose shift has begun can only be declined, as the database
// refuses approving it: Maya took Omer's Tuesday morning, which began at
// 09:00, and at noon it says why, offers no approval and is not counted.
test("the swaps demo offers only declining once the shift has begun", async ({
  page,
}) => {
  const ap = he.app.swaps;
  const morning = heT("app.shifts.shift", {
    name: "בוקר",
    day: he.app.availability.weekdays.tue,
    date: "3.11",
  });
  const decision = (name: string) =>
    page
      .getByRole("button", { name: new RegExp(`^${name}, ${morning}:`) })
      .filter({ visible: true });

  await page.goto("/design/shell/schedule/swaps");
  const main = page.getByRole("main");
  await expect(
    main.getByText(ap.failures.started).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(decision(ap.buttons.approve)).toHaveCount(0);
  await expect(decision(ap.buttons.decline)).toHaveCount(1);
  // The two taken requests still to come are counted, not the third.
  await expect(main).toContainText(heT("app.swaps.count", { count: 2 }));
});

// What became of Noa's requests that no longer wait (the twins' DEMO_ENDED):
// tonight's wasn't approved, so her hero says so and still offers it, until
// it begins; Thursday's the schedule cancelled, in its row; and the list has
// one row a shift, five of them, each saying what happened and with whom, and
// Yoav's Thursday morning, deleted since, that its shift was taken off.
// Friday's, withdrawn, she asked again, so its live request says where it
// stands; Monday's is before today.
test("the shifts demo says what happened to Noa's requests", async ({
  page,
}) => {
  const sw = he.app.shifts.swap;
  const past = he.app.shifts.past;
  const evening = heT("app.shifts.shift", {
    name: "ערב",
    day: he.app.availability.weekdays.tue,
    date: "3.11",
  });
  const hero = page.getByRole("region", { name: evening, exact: true });

  await page.goto("/design/shell/schedule/shifts");
  await expect(hero).toContainText(sw.declined);
  await expect(hero).toContainText(he.app.shifts.hero.giveAgain);
  await expect(
    hero.getByRole("button", { name: `${sw.buttons.give}, ${evening}` }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("list", { name: he.app.shifts.mine.title }),
  ).toContainText(sw.removed);
  const list = page.getByRole("list", { name: past.title });
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(list).toContainText(
    heT("app.shifts.past.declined", { name: "מאיה פרץ" }),
  );
  await expect(list).toContainText(
    heT("app.shifts.past.approvedFrom", { name: "שירה ביטון" }),
  );
  await expect(list).toContainText(
    heT("app.shifts.past.declined", { name: "עומר אזולאי" }),
  );
  const gone = list.getByRole("listitem").filter({ hasText: past.gone });
  await expect(gone).toHaveCount(1);
  await expect(gone).toContainText(
    heT("app.shifts.past.withdrawnTo", { name: "יואב לוי", form: "m" }),
  );
  await expect(list).toContainText(past.schedule);
  await expect(list).not.toContainText(past.withdrawnFrom);
  await expect(list).not.toContainText("2.11");

  await page.goto("/design/shell/schedule/shifts?at=evening");
  await expect(hero).toContainText(he.app.shifts.yours);
  await expect(hero).not.toContainText(sw.declined);
});

// Under the requests waiting, the four a colleague took that no longer wait,
// from today on, each saying who decided ("you" for Shiran) or why it was
// cancelled: cards on phones and tablets, a table on desktops. The count is
// still the waiting ones'.
test("the swaps demo lists the requests no longer waiting", async ({
  page,
}, testInfo) => {
  const ap = he.app.swaps;
  const desktop = testInfo.project.name === "desktop";
  await page.goto("/design/shell/schedule/swaps");
  const ended = (
    desktop
      ? page.getByRole("table", { name: ap.ended.title })
      : page.getByRole("list", { name: ap.ended.title })
  ).filter({ visible: true });
  await expect(
    desktop ? ended.locator("tbody tr") : ended.getByRole("listitem"),
  ).toHaveCount(4);
  await expect(ended).toContainText(ap.ended.approvedYou);
  await expect(ended).toContainText(ap.ended.declinedYou);
  await expect(ended).toContainText(
    heT("app.swaps.ended.declined", { name: "אורי בן דוד", form: "x" }),
  );
  await expect(ended).toContainText(
    heT("app.swaps.ended.withdrawn", { name: "יואב לוי", form: "m" }),
  );
  await expect(page.getByRole("main")).toContainText(
    heT("app.swaps.count", { count: 2 }),
  );
});

// The ways into the week under way on the Today twin (R4) open the
// restaurant's builder on that week, under its own title, not next week's.
test("the Today demo's open places this week open this week's builder", async ({
  page,
}) => {
  const thisWeek = "/design/shell/schedule/build?week=2026-11-01";
  await page.goto("/design/shell");
  const tile = page
    .getByRole("main")
    .locator(`a[href="${thisWeek}"]`)
    .filter({
      visible: true,
      hasText: heT("app.home.needs.gapsThisWeek", { count: 4 }),
    });
  await expect(tile).toHaveCount(1);
  await tile.click();
  await expect(page).toHaveURL(
    /\/design\/shell\/schedule\/build\?week=2026-11-01$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.build.titleRunning }),
  ).toBeVisible();
});

// The owner's first steps on the Today demo: each row leads to its screen in
// the demo, "הסתרה" takes the card away with a way back, and the team
// viewing as the owner has no "הסתרה".
test("the Today demo's first steps lead into the demo and hide with a way back", async ({
  page,
}) => {
  const f = he.app.home.firstSteps;
  const card = page.getByRole("region", { name: f.title });
  await page.goto("/design/shell/today/first-steps");
  await expect(card).toContainText(
    heT("app.home.firstSteps.progress", { done: 2, total: 5 }),
  );
  await expect(card).toContainText(
    heT("app.home.firstSteps.next", { step: f.steps.departments.title }),
  );
  const links = card.getByRole("link");
  await expect(links).toHaveCount(6);
  for (const href of await links.evaluateAll((all) =>
    all.map((a) => a.getAttribute("href") ?? ""),
  )) {
    expect(href).toMatch(/^\/design\/shell\//);
  }

  const hide = card.getByRole("button", { name: f.hide });
  await hide.click();
  await expect(card).toHaveCount(0);
  const undo = page
    .getByRole("status")
    .filter({ hasText: f.hidden })
    .getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(card).toBeVisible();
  await expect(hide).toBeFocused();

  await card
    .getByRole("link", { name: new RegExp(`^${f.steps.departments.title}`) })
    .click();
  await expect(page).toHaveURL(/\/design\/shell\/manage\/departments$/);

  await page.goto("/design/shell/today/first-steps?state=viewing");
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: f.hide })).toHaveCount(0);
});

// Signed in again on the business's clock station (#78 phase 5): Today says
// the device is the station, and "נעילת המכשיר" locks it again as that same
// station, with no new name, to the station's twin. Whoever may lock it isn't
// told to sign out instead. Anywhere else, Today says nothing of a station.
test("the Today demo on the clock station locks it again as the same station", async ({
  page,
}) => {
  const reminder = he.app.clock.station.reminder;
  const lock = he.app.clock.station.lock;
  const body = page.getByText(reminder.body);
  const signOutBody = page.getByText(reminder.signOutBody);
  const again = page.getByRole("button", { name: reminder.lock, exact: true });

  await page.goto("/design/shell");
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(body).toHaveCount(0);
  await expect(signOutBody).toHaveCount(0);
  await expect(again).toHaveCount(0);

  await page.goto("/design/shell/today/station");
  await expect(body).toBeVisible();
  await expect(signOutBody).toHaveCount(0);
  await expect(page.getByRole("button", { name: he.app.signOut })).toHaveCount(
    0,
  );
  await again.click();
  const sheet = page.getByRole("dialog", { name: lock.title });
  await expect(
    sheet.getByText(
      heT("app.clock.station.lock.same", { name: "עמדת הכניסה" }),
    ),
  ).toBeVisible();
  await expect(sheet.getByLabel(lock.name)).toHaveCount(0);
  await sheet.getByRole("button", { name: lock.submit }).click();
  await expect(page).toHaveURL(/\/design\/shell\/station$/);
  await expect(
    page.getByRole("img", { name: he.app.clock.code.qrLabel }),
  ).toBeVisible();
});

// Signed in on the business's clock station by someone who doesn't lock it
// (Orel, 20 November 2026): Today says the device is the business's tablet,
// with no lock, and "יציאה מהחשבון" goes to the station's twin, as the device
// goes back to its code. The accountant's Home says the same.
test("the Today demo on the clock station tells whoever doesn't lock it to sign out, and goes to the station", async ({
  page,
}) => {
  const reminder = he.app.clock.station.reminder;
  const body = page.getByText(reminder.signOutBody);
  const again = page.getByRole("button", { name: reminder.lock, exact: true });
  const signOut = page.getByRole("button", { name: he.app.signOut });
  const qr = page.getByRole("img", { name: he.app.clock.code.qrLabel });

  await page.goto("/design/shell/today/station?state=worker");
  await expect(body).toBeVisible();
  await expect(page.getByText(reminder.body)).toHaveCount(0);
  await expect(again).toHaveCount(0);
  await signOut.click();
  await expect(page).toHaveURL(/\/design\/shell\/station$/);
  await expect(qr).toBeVisible();

  await page.goto("/design/shell/today/accountant?state=station");
  await expect(body).toBeVisible();
  await expect(again).toHaveCount(0);
  await signOut.click();
  await expect(page).toHaveURL(/\/design\/shell\/station$/);
  await expect(qr).toBeVisible();

  // Her Home anywhere else says nothing of a station.
  await page.goto("/design/shell/today/accountant");
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(body).toHaveCount(0);
});

// A stale screen on the builder's demo (R1b), at every size: Omer gives his
// Sunday evening away, and Maya took Noa's Sunday morning. Taking Itay off the
// morning ends no request, so nothing is said; taking Omer off the evening
// ends his, and the line above "פרסום השינויים" says so first. Another
// manager approved Maya's meanwhile, so the publish is refused: the morning
// comes back as it is now, marked and named, the evening keeps its change,
// and publishing again goes out, with its own time on the status line. Each
// publish waits out its hold for "ביטול" first (R3b). The first is pressed
// from the keyboard: "ביטול" takes the focus, and the publish waits with the
// toast for as long as it stays there; once the focus moves on, the rest of
// the wait runs out and the publish goes, and refused, nothing of the held
// toast stays, its "ביטול" least of all.
test("the builder demo warns before ending a request, and puts back a shift changed meanwhile", async ({
  page,
}) => {
  // Its publishes wait out their holds for "ביטול" (`HOLD_MS` each), and the
  // first waits longer, stopped for the keyboard.
  test.setTimeout(90_000);
  const tb = he.app.build;
  const path = "/design/shell/schedule/build?state=meanwhile";
  const screen = buildScreen(page);
  const publish = page.getByRole("button", { name: tb.publishChanges });
  const warning = page.getByText(heT("app.build.swapsEnd", { count: 1 }));
  const morning = screen.card("בוקר");
  const evening = screen.card("ערב");
  const status = page.getByText(new RegExp(`^${before(tb.publishedAt)}`));

  await page.goto(path);
  await expect(morning).toContainText("נועה");
  // Published, with nothing new to send.
  await expect(publish).toHaveCount(0);

  await morning.click();
  await screen.removeButton("איתי מזרחי").click();
  await screen.closeSheet();
  await expect(publish).toBeVisible();
  await expect(warning).toHaveCount(0);

  await evening.click();
  await screen.removeButton("עומר אזולאי").click();
  await screen.closeSheet();
  await expect(warning).toBeVisible();

  // It waits for its undo first, and only then reaches the stand-in. From
  // the keyboard, the wait stops while the focus is on "ביטול".
  const refused = page.getByRole("alert").filter({
    hasText: heT("app.build.moved.changedOne", {
      name: "בוקר",
      day: he.app.availability.weekdays.sun,
    }),
  });
  await publish.focus();
  await page.keyboard.press("Enter");
  await expect(screen.held).toBeVisible();
  await expect(screen.undoHeld()).toBeFocused();
  await page.waitForTimeout(HOLD_MS + 1_000);
  await expect(screen.held).toBeVisible();
  await expect(publish).toBeDisabled();
  await expect(refused).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(screen.undoHeld()).not.toBeFocused();
  await expect(screen.held).toHaveCount(0, { timeout: HOLD_MS + 5_000 });
  await expect(refused).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .getByRole("button", { name: he.app.manage.undo, exact: true }),
  ).toHaveCount(0);
  // The morning as it is now: Maya in Noa's place, and Itay back on it.
  await expect(morning).toContainText(tb.meanwhile);
  await expect(morning).toContainText("מאיה");
  await expect(morning).toContainText("איתי");
  await expect(morning).not.toContainText("נועה");
  // The evening keeps its change, and Omer's request would still end.
  await expect(evening).not.toContainText("עומר");
  await expect(evening).not.toContainText(tb.meanwhile);
  await expect(warning).toBeVisible();
  await expectCleanPage(page, path);

  await screen.publishChanges();
  await expect(
    page.getByRole("status").filter({ hasText: tb.published }),
  ).toBeVisible();
  await expect(publish).toHaveCount(0);
  await expect(morning).not.toContainText(tb.meanwhile);
  // Published now, not when the demo week was first published (29.10).
  await expect(status).toBeVisible();
  await expect(status).not.toContainText("29.10");
});

/** The text a share sheet's WhatsApp link writes. */
async function sharedText(sheet: Locator): Promise<string> {
  const href = await sheet
    .getByRole("link", { name: he.ui.share.whatsapp })
    .getAttribute("href");
  return new URL(href ?? "").searchParams.get("text") ?? "";
}

// Sharing a published week, in the builder's dock once nothing is new: the
// message names the business and its week, and its link leads to the
// schedule tab's twin on that week. After the stand-in's publish, and at
// rest on a published week, also for someone who builds without publishing.
// From the keyboard, the sheet gives the focus back to what opened it.
test("the builder demo offers sharing once published", async ({ page }) => {
  const tb = he.app.build;
  const ts = he.app.shifts.share;
  const share = page.getByRole("button", { name: ts.action });
  const sheet = page.getByRole("dialog", { name: ts.title });
  // The restaurant has no week before to copy, and a published week takes
  // no copy.
  const copy = page.getByRole("button", { name: tb.copy.action });

  await page.goto("/design/shell/schedule/build");
  await expect(page.getByRole("button", { name: tb.publish })).toBeVisible();
  await expect(share).toHaveCount(0);
  await expect(copy).toHaveCount(0);
  await page.getByRole("button", { name: tb.publish }).click();
  await expect(
    page.getByRole("status").filter({ hasText: tb.published }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: tb.publish })).toHaveCount(0);
  await share.click();
  await expect(sheet).toBeVisible();
  // The demo week, 1 to 7 November, in the browser's own words, its days
  // held left to right as the share holds them.
  const range = daysLeftToRight(
    await page.evaluate(() =>
      new Intl.DateTimeFormat("he", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).formatRange(
        new Date("2026-11-01T00:00:00Z"),
        new Date("2026-11-07T00:00:00Z"),
      ),
    ),
  );
  expect(await sharedText(sheet)).toBe(
    `${heT("app.shifts.share.text", {
      business: "מסעדת הדגמה",
      range,
      kind: "other",
    })}\n${new URL(page.url()).origin}/design/shell/schedule?week=2026-11-01`,
  );
  await expectCleanPage(page, "", true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(share).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(share).toBeFocused();

  // At rest on a published week, also only to read it.
  for (const path of [
    "/design/shell/schedule/build?state=meanwhile",
    "/design/shell/schedule/build?state=meanwhile&publishes=no",
  ]) {
    await page.goto(path);
    await expect(share).toBeVisible();
    await expect(
      page.getByRole("button", { name: tb.publishChanges }),
    ).toHaveCount(0);
    await expect(copy).toHaveCount(0);
  }

  // The shop's week under way, by the shop's own name.
  await page.goto("/design/shell/schedule/build/running");
  await expect(share).toBeVisible();
  await expect(copy).toHaveCount(0);
  await share.click();
  expect(await sharedText(sheet)).toContain("חנות הדגמה");
});

// The link in a shared schedule names its week (`?week=`): the schedule tab's
// twin opens on next week with it, and on this week, Shiran's, without it or
// with a week that is neither. Only the published week offers sharing it.
test("the schedule demo opens on the week its link names", async ({ page }) => {
  const path = "/design/shell/schedule";
  const week = (key: "this" | "next") =>
    page.getByRole("button", { name: he.app.shifts.week[key], exact: true });
  const share = page.getByRole("button", { name: he.app.shifts.share.action });

  await page.goto(path);
  await expect(week("this")).toHaveAttribute("aria-pressed", "true");
  await expect(share).toBeVisible();

  await page.goto(`${path}?week=2026-11-08`);
  await expect(week("next")).toHaveAttribute("aria-pressed", "true");
  await expect(week("this")).toHaveAttribute("aria-pressed", "false");
  await expect(share).toHaveCount(0);

  await page.goto(`${path}?week=2026-11-15`);
  await expect(week("this")).toHaveAttribute("aria-pressed", "true");
});

// The reminder on the team's answers, while someone is missing: one message
// for the whole team with the week and the due moment, or that it is still
// not too late; nobody's name. None once everyone sent.
test("the team availability demo sends a reminder, and says it is late when it is", async ({
  page,
}) => {
  const tt = he.app.availability.team;
  const path = "/design/shell/schedule/availability/team";
  const remind = page.getByRole("button", { name: tt.remind.action });
  const sheet = page.getByRole("dialog", { name: tt.remind.title });
  // The demo week, 1 to 7 November, due on Wednesday 28 October at 18:00.
  // Its days held left to right, as the reminder holds them.
  const range = async () =>
    daysLeftToRight(
      await page.evaluate(() =>
        new Intl.DateTimeFormat("he", {
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        }).formatRange(
          new Date("2026-11-01T00:00:00Z"),
          new Date("2026-11-07T00:00:00Z"),
        ),
      ),
    );
  const words = async () => ({
    business: "מסעדת הדגמה",
    range: await range(),
    day: he.app.availability.weekdays.wed,
    time: "18:00",
  });
  const link = () =>
    `${new URL(page.url()).origin}/design/shell/schedule/availability`;

  await page.goto(path);
  await remind.focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  // The whole message, so nobody's name is in it.
  expect(await sharedText(sheet)).toBe(
    `${heT("app.availability.team.remind.text", await words())}\n${link()}`,
  );
  await expectCleanPage(page, path, true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(remind).toBeFocused();

  await page.goto(`${path}?state=late`);
  await remind.click();
  expect(await sharedText(sheet)).toBe(
    `${heT("app.availability.team.remind.textLate", await words())}\n${link()}`,
  );

  await page.goto(`${path}?state=all`);
  await expect(
    page.getByRole("heading", { level: 1, name: tt.title }),
  ).toBeVisible();
  await expect(remind).toHaveCount(0);
});

// The running week's twin (R3a), at every size: the shop on Tuesday 17
// November at 11:20. The morning under way says so and only takes more
// people; Monday is over, muted, keeps Liya who left, and takes no new shift;
// the evening freed when she left takes Omer, with the line to check with its
// people directly, and goes out. Roni's request on Thursday evening, which
// nothing touches, is not counted. The switch to next week asks first while
// there is unsaved work. Publishing the changes waits for "ביטול" (R3b): the
// held state, let go once and then waited out.
test("the running week's demo locks what has begun and fills the freed evening", async ({
  page,
}, testInfo) => {
  // Its publishes wait out their holds for "ביטול" (`HOLD_MS` each).
  test.setTimeout(60_000);
  const tb = he.app.build;
  const running = tb.running;
  const path = "/design/shell/schedule/build/running";
  const screen = buildScreen(page);
  const tue = { day: he.app.availability.weekdays.tue, date: "17.11" };
  const mon = { day: he.app.availability.weekdays.mon, date: "16.11" };
  const publish = page.getByRole("button", { name: tb.publishChanges });
  const nextWeek = page.getByRole("button", {
    name: new RegExp(`^${he.app.shifts.week.next}`),
  });
  const warning = page.getByRole("dialog", { name: tb.leave.title });

  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: tb.titleRunning }),
  ).toBeVisible();
  // Published, with nothing new to send.
  await expect(publish).toHaveCount(0);

  const morning = screen.card("בוקר", tue);
  await expect(morning).toContainText(running.now);
  await morning.click();
  await expect(screen.sheet).toContainText(before(running.begunLine));
  await expect(screen.removeButton("תמר אברהם")).toHaveCount(0);
  await expect(
    screen.sheet.getByRole("button", {
      name: tb.edit.replace("{name}", "בוקר"),
    }),
  ).toHaveCount(0);
  await expect(screen.addButton("עומר הדגמה")).toBeVisible();
  await screen.closeSheet();

  // A day that is over takes no new shift; today does.
  await expect(screen.addOn(mon)).toHaveCount(0);
  await expect(screen.addOn(tue)).toBeVisible();
  if (testInfo.project.name !== "phone") {
    // The phone shows today; the others show Monday, muted, as it was.
    const over = screen.card("בוקר", mon);
    await expect(over).toContainText(he.app.shifts.former);
    await over.click();
    await expect(screen.sheet).toContainText(
      `${running.overLine} ${running.clockLine}`,
    );
    await expect(
      screen.sheet.getByRole("button", {
        name: new RegExp(`^${before(tb.addPerson)}`),
      }),
    ).toHaveCount(0);
    await screen.closeSheet();
  }

  const evening = screen.card("ערב", tue);
  await expect(evening).toContainText(heT("app.build.missing", { count: 1 }));
  await evening.click();
  await screen.addButton("עומר הדגמה").click();
  await screen.closeSheet();
  await expect(evening).toContainText("עומר");
  await expect(page.getByText(running.soon)).toBeVisible();
  await expect(
    page.getByText(heT("app.build.swapsEnd", { count: 1 })),
  ).toHaveCount(0);
  await expectCleanPage(page, path);

  // Unsaved work: the switch to next week asks first.
  await nextWeek.click();
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: tb.leave.stay }).click();
  await expect(warning).toHaveCount(0);
  await expect(evening).toContainText("עומר");

  // Publishing the changes waits for "ביטול" first, with nothing sent: the
  // team still sees the week as it was. "ביטול" brings the work back.
  await publish.click();
  await expect(screen.held).toBeVisible();
  await expect(publish).toBeDisabled();
  await expect(page.getByText(tb.unpublished)).toBeVisible();
  await screen.undoHeld().click();
  await expect(
    page.getByRole("status").filter({ hasText: tb.hold.undone }),
  ).toBeVisible();
  await expect(publish).toBeEnabled();
  await expect(evening).toContainText("עומר");

  // Held again, and checked as it waits (should the checks outlast the hold,
  // it goes meanwhile, as it would); then it goes out.
  await publish.click();
  await expect(screen.held).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("schedule-build-held.png"),
    fullPage: true,
  });
  await expectCleanPage(page, path);
  await expect(screen.held).toHaveCount(0, { timeout: HOLD_MS + 5_000 });
  await expect(
    page.getByRole("status").filter({ hasText: tb.published }),
  ).toBeVisible();
  await expect(publish).toHaveCount(0);
  // "ביטול" had the focus and went with the toast: with no publish left to
  // press, the focus is on the line that says the week is published.
  await expect(
    page.getByText(new RegExp(`^${before(tb.publishedAt)}`)),
  ).toBeFocused();
  await expect(screen.card("בוקר", tue)).toContainText(running.now);

  // Nothing unsaved now: the switch just goes.
  await nextWeek.click();
  await expect(page).toHaveURL(/\/running\?week=next$/);
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
  ).toBeVisible();
});

// Copying last week on the running twin's next week, at every size: the
// shop's week under way onto next week, drawn from the pattern. The sheet
// says how many shifts and people it copies, counts Liya, who left, without
// a name, and lists Tamar, who can only do mornings next week, under those
// not available, on Thursday evening; nothing is saved until the dock is
// pressed. Copied, Sunday morning has Tamar and Itai, and the toast's
// "ביטול", which takes the focus, brings back the pattern's empty morning.
// On a draft with people on Sunday, Sunday stays as it is unless the sheet's
// switch replaces it; changed after that copy, the toast goes with its way
// back, which would have taken the change too.
test("next week's demo copies last week, says who was left out, and takes it back", async ({
  page,
}) => {
  const tb = he.app.build;
  const tc = tb.copy;
  const path = "/design/shell/schedule/build/running?week=next";
  const screen = buildScreen(page);
  const copy = page.getByRole("button", { name: tc.action });
  const sheet = page.getByRole("dialog", { name: tc.title });
  const sun = { day: he.app.availability.weekdays.sun, date: "22.11" };
  const morning = screen.card("בוקר", sun);
  const evening = screen.card("ערב", sun);
  const days = sheet.getByRole("group", { name: tc.daysTitle, exact: true });
  const sunday = days
    .locator("div", {
      has: page.getByText(heT("app.build.day", sun), { exact: true }),
    })
    .last();
  const submit = (count: number) =>
    sheet.getByRole("button", {
      name: heT("app.build.copy.submit", { count }),
    });

  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
  ).toBeVisible();
  await expect(morning).toContainText(tb.nobody);
  await copy.click();
  await expect(sheet).toContainText(
    heT("app.build.copy.summary", { shifts: 11, people: 4 }),
  );
  await expect(sunday).toContainText(
    heT("app.build.copy.days.replaced", { count: 2, was: 2 }),
  );
  await expect(sheet).toContainText(heT("app.build.copy.gone", { count: 1 }));
  const unavailable = screen.group(tb.groups.unavailable);
  await expect(unavailable).toContainText("תמר אברהם");
  await expect(unavailable).toContainText(
    heT("app.build.copy.skippedOn", {
      shift: "ערב",
      day: he.app.availability.weekdays.thu,
    }),
  );
  await expect(sheet).toContainText(tc.note);
  // Nobody on next week's Sunday yet: nothing to replace, so no switch.
  await expect(sheet.getByRole("switch")).toHaveCount(0);
  await expectCleanPage(page, path, true);

  await submit(11).click();
  await expect(sheet).toHaveCount(0);
  await expect(morning).toContainText("תמר");
  await expect(morning).toContainText("איתי");
  await expect(page.getByText(tb.unsaved)).toBeVisible();
  const toast = page
    .getByRole("status")
    .filter({ hasText: heT("app.build.copy.done", { count: 11 }) });
  const undo = toast.getByRole("button", {
    name: he.app.manage.undo,
    exact: true,
  });
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(
    page.getByRole("status").filter({ hasText: tc.undone }),
  ).toBeVisible();
  await expect(morning).toContainText(tb.nobody);
  await expect(copy).toBeFocused();

  // Saved as a draft with Tamar and Itai on Sunday morning: Sunday stays as
  // it is, unless the switch replaces it too.
  await page.goto(`${path}&state=draft`);
  await expect(evening).toContainText(tb.nobody);
  await copy.click();
  await expect(sunday).toContainText(tc.days.kept);
  await expect(sheet).toContainText(
    heT("app.build.copy.summary", { shifts: 9, people: 4 }),
  );
  const replace = sheet.getByRole("switch", { name: tc.replace.label });
  await expect(replace).toHaveAttribute("aria-checked", "false");
  await replace.click();
  await expect(sunday).toContainText(
    heT("app.build.copy.days.replaced", { count: 2, was: 2 }),
  );
  await submit(11).click();
  await expect(sheet).toHaveCount(0);
  // Sunday's evening is this week's now: Roni, without Liya.
  await expect(evening).toContainText("רוני");
  await expect(morning).toContainText("תמר");

  // Changed after the copy, here on a shift the copy made: "ביטול" would
  // take the change with it, so the toast goes with its way back, and the
  // copy and the change both stay.
  await expect(undo).toBeFocused();
  await evening.click();
  await screen.addButton("מיכל הדגמה").click();
  await screen.closeSheet();
  // The page is back for the locators (the sheet hid it), the toast too.
  await expect(evening).toContainText("מיכל");
  await expect(evening).toContainText("רוני");
  await expect(morning).toContainText("תמר");
  await expect(page.getByText(tb.unsaved)).toBeVisible();
  // Gone with the change, well inside the 10 seconds it would stay otherwise.
  await expect(toast).toHaveCount(0, { timeout: 2_000 });
});

// The demo door per site (P9): the demo's site offers it from sign-in; the
// site of real businesses (DEMO_DOOR=off, the twin's ?door=off) has the
// same screen with no way to it and nothing in its place.
test("sign-in offers the demo only where the demo door is open", async ({
  page,
}) => {
  const t = he.auth.signIn;
  const main = page.getByRole("main");
  await page.goto("/design/screens/sign-in");
  await expect(main.getByRole("link", { name: t.demo })).toBeVisible();

  await page.goto("/design/screens/sign-in?door=off");
  await expect(main.getByRole("button", { name: t.send })).toBeVisible();
  await expect(main.getByLabel(t.phoneLabel)).toBeVisible();
  await expect(main.getByRole("link", { name: t.demo })).toHaveCount(0);
});

// The "אני לא רובוט" check (P9b) as Cloudflare draws it, on the sign-in
// twin: its test key that always passes settles with a token, and the one
// that always asks shows the tick's line and Cloudflare's box. Nothing is
// pressed inside Cloudflare's frame, and axe leaves it out.
test("the check's live twin draws Cloudflare's own widget", async ({
  page,
}) => {
  await page.goto("/design/screens/sign-in?captcha=live");
  await expect(page.locator('[data-captcha="ready"]')).toHaveCount(1, {
    timeout: 20_000,
  });

  await page.goto("/design/screens/sign-in?captcha=ask");
  await expect(page.getByText(he.ui.captcha.tap)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(CAPTCHA_FRAME)).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .exclude(CAPTCHA_FRAME)
    .analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary}`),
    ),
  ).toEqual([]);
});

// The gallery's check: its stand-in in each state, picked above it.
test("the gallery's check draws each of its states", async ({ page }) => {
  const d = he.design;
  const w = he.ui.captcha;
  await page.goto("/design");
  const states = page.getByRole("group", { name: d.captcha });
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: d.captcha, exact: true }),
  });
  for (const [state, line] of [
    ["waiting", w.waiting],
    ["tap", w.tap],
    ["failed", w.failed],
    ["unavailable", w.unavailable],
  ] as const) {
    await states.getByRole("button", { name: d.captchaStates[state] }).click();
    await expect(section.getByText(line)).toBeVisible();
  }
  await states.getByRole("button", { name: d.captchaStates.failed }).click();
  await expect(section.getByRole("button", { name: w.retry })).toBeVisible();
  await states.getByRole("button", { name: d.captchaStates.ready }).click();
  for (const line of [w.waiting, w.tap, w.failed, w.unavailable]) {
    await expect(section.getByText(line)).toHaveCount(0);
  }
});

// A demo business takes no invites (#80): its Team screen offers none and
// says why, at every size; a real one keeps its invite and new links.
test("the team demo offers no invite in a demo business", async ({ page }) => {
  const tt = he.app.team;
  const main = page.getByRole("main");
  await page.goto("/design/shell/team");
  await expect(
    main.getByRole("link", { name: tt.inviteAction }).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    main
      .getByRole("button", { name: new RegExp(`^${tt.link.new}`) })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(main.getByText(tt.invites.closed)).toHaveCount(0);

  await page.goto("/design/shell/team?state=demo");
  await expect(
    main.getByText(tt.invites.closed).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(main.getByRole("link", { name: tt.inviteAction })).toHaveCount(
    0,
  );
  await expect(
    main.getByRole("button", { name: new RegExp(`^${tt.link.new}`) }),
  ).toHaveCount(0);
  // Nor deleting one: a demo business keeps its invites as its people.
  await expect(
    main.getByRole("button", { name: new RegExp(`^${tt.cancel.action}`) }),
  ).toHaveCount(0);
});

// Team changes on the demo (Orel, 14 November 2026): the owner deletes an
// invite and takes it back, changes Noa's role and changes it back, and takes
// her off the team, first with an undo, then for real; the page then says
// what came off her and leads back to the team. Nothing is stored.
test("the team demo deletes an invite, changes a role and takes someone off the team, each with an undo", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const tt = he.app.team;
  const tc = tt.changes;
  const undo = he.app.manage.undo;
  const main = page.getByRole("main");

  await page.goto("/design/shell/team");
  const dana = main
    .getByRole("button", {
      name: heT("app.team.cancel.label", { name: "דנה אברהם" }),
    })
    .filter({ visible: true });
  await expect(dana).toHaveCount(1);
  await dana.click();
  const deleted = main
    .getByRole("status")
    .filter({ hasText: heT("app.team.cancel.done", { name: "דנה אברהם" }) })
    .filter({ visible: true });
  await expect(deleted).toBeVisible();
  await expect(dana).toHaveCount(0);
  await deleted.getByRole("button", { name: undo }).click();
  await expect(dana).toHaveCount(1);

  await page.goto("/design/shell/team/noa");
  const role = main.getByRole("button", { name: new RegExp(`^${tc.role}`) });
  await expect(role).toContainText(tt.roles.worker);
  await role.click();
  await page
    .getByRole("dialog")
    .locator('input[name="member-role"][value="manager"]')
    .check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: tc.roleSubmit })
    .click();
  await expect(role).toContainText(tt.roles.manager);
  await main
    .getByRole("status")
    .filter({
      hasText: heT("app.team.changes.roleChanged", {
        name: "נועה כהן",
        role: tt.roles.manager,
      }),
    })
    .getByRole("button", { name: undo })
    .click();
  await expect(role).toContainText(tt.roles.worker);

  const remove = main.getByRole("button", { name: tc.remove });
  // What it does, said beforehand: three shifts ahead and two in the draft.
  await expect(
    main.getByText(heT("app.team.changes.removeShifts", { count: 5 }), {
      exact: false,
    }),
  ).toBeVisible();
  await remove.click();
  const removed = main.getByRole("status").filter({
    hasText: heT("app.team.changes.removed", { name: "נועה כהן", form: "f" }),
  });
  await expect(removed).toBeVisible();
  await expect(remove).toHaveCount(0);
  await removed.getByRole("button", { name: undo }).click();
  await expect(remove).toBeVisible();

  await remove.click();
  await expect(
    main.getByRole("heading", {
      name: heT("app.team.changes.removedTitle", { name: "נועה כהן" }),
    }),
  ).toBeVisible({ timeout: 20_000 });
  // And after, the same counts: as many now need someone.
  await expect(
    main.getByText(heT("app.team.changes.removedShifts", { count: 3 })),
  ).toBeVisible();
  await expect(
    main.getByText(heT("app.team.changes.removedDrafts", { count: 2 })),
  ).toBeVisible();
  // The swap requests it settled: hers cancelled, the one she took open again.
  await expect(
    main.getByText(heT("app.team.changes.removedSwaps", { count: 1 })),
  ).toBeVisible();
  await expect(
    main.getByText(
      heT("app.team.changes.removedReopened", { count: 1, name: "נועה כהן" }),
    ),
  ).toBeVisible();
  await expectCleanPage(page);
  await main.getByRole("link", { name: tc.backToTeam }).click();
  await expect(page).toHaveURL(/\/design\/shell\/team$/);

  // On the clock now: not yet, and their hours instead.
  await page.goto("/design/shell/team/noa?state=clocked");
  await expect(main.getByRole("button", { name: tc.remove })).toHaveCount(0);
  await expect(
    main.getByText(heT("app.team.changes.clockedIn", { name: "נועה" })),
  ).toBeVisible();
  // A manager gets nothing on an owner.
  await page.goto("/design/shell/team/uri?as=manager");
  await expect(main.getByRole("button", { name: tc.remove })).toHaveCount(0);
  await expect(
    main.getByRole("button", { name: new RegExp(`^${tc.role}`) }),
  ).toHaveCount(0);
});

// Fixing a name on the demo (ROADMAP "תיקון שם"): the owner fixes Noa's,
// shown at once in the title, with the fix back as its undo; someone nobody
// named reads "בלי שם"; whoever may not change the person gets no row.
// Nothing is stored.
test("the person demo fixes a name, with the change back as its undo", async ({
  page,
}) => {
  const tt = he.app.team;
  const tc = tt.changes;
  const main = page.getByRole("main");
  const nameRow = main
    .getByRole("button")
    .filter({ has: page.getByText(tc.name, { exact: true }) });
  const heading = (name: string) =>
    main.getByRole("heading", { level: 1, name, exact: true });

  await page.goto("/design/shell/team/noa");
  await expect(nameRow).toContainText("נועה כהן");
  await nameRow.click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("heading", { name: tc.nameSheet }),
  ).toBeVisible();
  await expectCleanPage(page, "", true);
  const field = sheet.getByLabel(tt.invite.name, { exact: true });
  await field.fill(" ");
  await sheet.getByRole("button", { name: tc.nameSubmit }).click();
  await expect(sheet).toContainText(tt.invite.errors.name.required);
  await field.fill("נועה  כהן-לוי");
  await sheet.getByRole("button", { name: tc.nameSubmit }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(heading("נועה כהן-לוי")).toBeVisible();
  await expect(nameRow).toContainText("נועה כהן-לוי");
  // The role row stays, in the same group.
  await expect(
    main.getByRole("button", { name: new RegExp(`^${tc.role}`) }),
  ).toBeVisible();
  await main
    .getByRole("status")
    .filter({
      hasText: heT("app.team.changes.nameChanged", { name: "נועה כהן-לוי" }),
    })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect(heading("נועה כהן")).toBeVisible();
  await expect(
    page.getByText(heT("app.team.changes.nameBack", { name: "נועה כהן" })),
  ).toBeVisible();
  await expectCleanPage(page);

  // Someone nobody named.
  await page.goto("/design/shell/team/noa?state=nameless");
  await expect(heading(tt.noName)).toBeVisible();
  await expect(nameRow).toContainText(tt.noName);

  // Not on an owner for a manager, nor for whoever only sees the team.
  await page.goto("/design/shell/team/uri?as=manager");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(nameRow).toHaveCount(0);
  await page.goto("/design/shell/team/noa?as=viewer");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(nameRow).toHaveCount(0);
});

// Each person's page in the clock demo shows their own shifts, not Noa's.
test("a person's hours in the demo match their row in the team list", async ({
  page,
}) => {
  // Yoav's cancelled shift is listed and counts as none.
  for (const [person, shifts] of [
    ["yoav", "5 משמרות"],
    ["shiran", "3 משמרות"],
  ] as const) {
    await page.goto(`/design/shell/clock/team/${person}`);
    await expect(
      page.getByText(`שעות, ${shifts}`).filter({ visible: true }).first(),
    ).toBeVisible();
  }
});

// A cancelled shift (the clock plan's PR3) in every shape: "בוטלה" instead of
// its hours, and who cancelled it, when and why; the worker reads the same in
// her history, where it can't be pressed (a manager's opens it, below), and
// the pay demo lists it apart.
test("the clock demo lists a cancelled shift with who, when and why", async ({
  page,
}) => {
  const cancelled = (time: string, note: string) =>
    heT.markup("app.clock.history.cancelledBy", {
      ltr: (chunks: string) => chunks,
      name: "שירן הדגמה",
      time,
      note,
    });
  for (const [path, line] of [
    [
      "/design/shell/clock/team/yoav",
      cancelled("4.11, 15:10", "נרשמה פעמיים בטעות"),
    ],
    [
      "/design/shell/clock/team/noa",
      cancelled("08:20", "נכנסה בטעות ביום חופש"),
    ],
    [
      "/design/shell/clock/history",
      cancelled("08:20", "נכנסה בטעות ביום חופש"),
    ],
  ] as const) {
    await page.goto(path);
    const main = page.getByRole("main");
    await expect(
      main.getByText(line).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      main
        .getByText(he.app.clock.history.cancelled, { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    if (path.endsWith("/history")) {
      await expect(
        main.getByRole("button").filter({ hasText: line }),
      ).toHaveCount(0);
    }
  }
  await page.goto("/design/shell/clock/pay/noa");
  await expect(
    page
      .getByRole("heading", { name: he.app.pay.person.cancelledTitle })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText(
        cancelled("18.10, 09:40", "נרשמה בטעות, נועה לא עבדה ביום שישי"),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// The clock station (#78 phase 5) on its twins: the code screen locks the
// device into a station, which shows the code with nobody's name and no
// frame, or says in words why there is none, and the team's hours stop a
// station at once with "ביטול".
test("the station demo locks the device on the code, and the team's hours stop a station with a way back", async ({
  page,
}) => {
  const lock = he.app.clock.station.lock;
  const listed = he.app.clock.team.stations;

  await page.goto("/design/shell/clock/code");
  await page.getByRole("button", { name: lock.open }).click();
  const sheet = page.getByRole("dialog", { name: lock.title });
  // Three run in the demo, the third called "עמדת שעון 3": the next is 4.
  await expect(sheet.getByLabel(lock.name)).toHaveValue(
    lock.defaultName.replace("{n}", "4"),
  );
  await expectCleanPage(page, "", true);
  await sheet.getByRole("button", { name: lock.submit }).click();
  await expect(page).toHaveURL(/\/design\/shell\/station$/);
  await expect(
    page.getByRole("img", { name: he.app.clock.code.qrLabel }),
  ).toBeVisible();
  await expect(page.getByText(/^\d{3} \d{3}$/)).toBeVisible();
  // No frame: nobody is signed in on a station to have one.
  await expect(
    page.getByRole("navigation", { name: he.ui.appShell.mainNav }),
  ).toHaveCount(0);

  // Running with a code, it says no refusal. Refused one while running (the
  // clock switched off, or codes on a manager's phone only), it says why in
  // words and shows no code: the twin's stand-in refuses as /station/code.
  const qr = page.getByRole("img", { name: he.app.clock.code.qrLabel });
  const digits = page.getByText(/^\d{3} \d{3}$/);
  const refused = he.station.refused;
  for (const words of [refused.clockOff, refused.managerOnly]) {
    await expect(page.getByText(words)).toHaveCount(0);
  }
  for (const state of ["clockOff", "managerOnly"] as const) {
    await page.goto(`/design/shell/station?state=${state}`);
    await expect(page.getByText(refused[state])).toBeVisible();
    await expect(qr).toHaveCount(0);
    await expect(digits).toHaveCount(0);
  }

  // Signed in on a device that is no station, with ten running: it says why
  // it can't be one, offers nothing it can't do, and home is the way on.
  const signedIn = he.station.signedIn;
  await page.goto("/design/shell/station?state=signedInFull");
  await expect(
    page.getByText(heT("app.clock.station.lock.full", { count: 10 })),
  ).toBeVisible();
  await expect(page.getByText(signedIn.lockNew)).toHaveCount(0);
  await expect(page.getByRole("button", { name: signedIn.lock })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: signedIn.home })).toBeVisible();
  // Where it can be locked, it says so, and locking is the main action.
  await page.goto("/design/shell/station?state=signedIn");
  await expect(page.getByText(signedIn.lockAgain)).toBeVisible();
  await expect(page.getByRole("button", { name: signedIn.lock })).toBeVisible();

  await page.goto("/design/shell/clock/team");
  const name = "טאבלט המטבח";
  // Each says whether it shows the code now, or when it last did.
  const stations = page
    .getByRole("main")
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: listed.title }) });
  await expect(stations.getByText(listed.showing)).toBeVisible();
  await expect(stations.getByText("23:12")).toBeVisible();
  await expect(stations.getByText(listed.never)).toBeVisible();
  const stop = page.getByRole("button", {
    name: listed.stopLabel.replace("{name}", name),
  });
  await stop.click();
  const undo = page
    .getByRole("status")
    .filter({ hasText: listed.stopped.replace("{name}", name) })
    .getByRole("button", { name: listed.undo });
  await expect(undo).toBeVisible();
  await expect(stop).toHaveCount(0);
  await undo.click();
  await expect(
    page.getByText(listed.restarted.replace("{name}", name)),
  ).toBeVisible();
  await expect(stop).toBeVisible();
});

// Cancelling and bringing back (the clock plan's PR4), on the demo's
// stand-ins: "ביטול המשמרת" sits under fixing a shift; its step asks why,
// cancels at once and offers "ביטול" in the toast rather than asking first. A
// cancelled shift opens from its row on every shape, with "החזרת המשמרת":
// Yoav's copy can't come back over the evening left, Noa's comes back open.
test("the clock demo cancels a shift with a way back, and brings one back", async ({
  page,
}, testInfo) => {
  const team = he.app.clock.team;
  const desktop = testInfo.project.name === "desktop";

  await page.goto("/design/shell/clock/team/yoav?state=edit");
  const edit = page.getByRole("dialog", { name: team.sheet.editTitle });
  await edit.getByRole("button", { name: team.sheet.cancelShift }).click();
  const cancel = page.getByRole("dialog", { name: team.cancel.title });
  await expect(cancel.getByText(team.cancel.hint)).toBeVisible();
  const reason = cancel.getByLabel(team.cancel.reason);
  await expect(reason).toBeFocused();

  // Without why, nothing goes: the field says so, and has the focus.
  await cancel.getByRole("button", { name: team.cancel.save }).click();
  await expect(cancel.getByText(team.cancel.reasonNeeded)).toBeVisible();
  await expect(reason).toBeFocused();
  await expectCleanPage(page, "", true);

  // Back to fixing it, the focus where it left, and on again.
  await cancel.getByRole("button", { name: team.cancel.back }).click();
  await expect(
    edit.getByRole("button", { name: team.sheet.cancelShift }),
  ).toBeFocused();
  await edit.getByRole("button", { name: team.sheet.cancelShift }).click();
  await cancel.getByLabel(team.cancel.reason).fill("נרשמה פעמיים");
  await cancel.getByRole("button", { name: team.cancel.save }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const toast = page.getByRole("status").filter({ hasText: team.done.cancel });
  const undo = toast.getByRole("button", { name: team.done.undo });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(
    page.getByRole("status").filter({ hasText: team.done.restore }),
  ).toBeVisible();

  // A cancelled shift opens from its row: the whole row on phones and
  // tablets, its "החזרה" on desktop.
  await page.goto("/design/shell/clock/team/yoav");
  const main = page.getByRole("main");
  const line = heT.markup("app.clock.history.cancelledBy", {
    ltr: (chunks: string) => chunks,
    name: "שירן הדגמה",
    time: "4.11, 15:10",
    note: "נרשמה פעמיים בטעות",
  });
  await (desktop
    ? main.getByRole("button", {
        name: new RegExp(before(he.app.clock.history.restoreShift)),
      })
    : main.getByRole("button").filter({ hasText: line })
  )
    .filter({ visible: true })
    .click();
  const cancelled = page.getByRole("dialog", { name: team.cancelled.title });
  await expect(cancelled.getByText(line)).toBeVisible();
  await cancelled.getByRole("button", { name: team.cancelled.restore }).click();
  await expect(cancelled.getByRole("alert")).toHaveText(team.failure.overlap);
  await expectCleanPage(page, "", true);

  // Noa's was still open when it was cancelled: it comes back open.
  await page.goto("/design/shell/clock/team/noa?state=cancelled");
  await expect(cancelled.getByText(team.cancelled.openHint)).toBeVisible();
  await cancelled.getByRole("button", { name: team.cancelled.restore }).click();
  await expect(cancelled).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: team.done.restore }),
  ).toBeVisible();
});

// Fixing breaks (the clock plan's PR5), on the demo's stand-ins: under the
// shift's times, a row for each break and "הוספת הפסקה"; a break's step
// refuses one over another break or outside the shift, in words, goes back
// with the focus on its row, saves, and removes at once with "ביטול" in the
// toast. A break still running opens nothing.
test("the clock demo fixes a shift's breaks, with a way back from a removal", async ({
  page,
}) => {
  const team = he.app.clock.team;
  await page.goto("/design/shell/clock/team/yoav?state=edit");
  const edit = page.getByRole("dialog", { name: team.sheet.editTitle });
  const breaks = edit.getByRole("group", { name: team.breaks.title });
  // Yoav's two breaks of that evening, and the way to add one.
  await expect(breaks.getByRole("button")).toHaveCount(3);
  const first = breaks.getByRole("button", { name: /18:30–18:45/ });
  await expect(first).toContainText(team.breaks.unpaid);
  await first.click();
  const step = page.getByRole("dialog", { name: team.breakStep.editTitle });
  const start = step.getByLabel(team.breakStep.start);
  await expect(start).toBeFocused();
  await expect(start).toHaveValue("18:30");

  // Over his other break, then before the shift began: refused in words.
  await step.getByLabel(team.breakStep.end).fill("21:05");
  await step.getByLabel(team.sheet.reason).fill("ההפסקה נמשכה יותר");
  await step.getByRole("button", { name: team.breakStep.save }).click();
  await expect(step.getByRole("alert")).toHaveText(team.failure.breakOverlap);
  await start.fill("15:00");
  await step.getByLabel(team.breakStep.end).fill("15:20");
  await step.getByRole("button", { name: team.breakStep.save }).click();
  await expect(step.getByRole("alert")).toHaveText(team.failure.breakOutside);
  await expectCleanPage(page, "", true);

  // Back to fixing the shift, the focus on the break's row; then saved.
  await step.getByRole("button", { name: team.breakStep.back }).click();
  await expect(first).toBeFocused();
  await first.click();
  await step.getByLabel(team.breakStep.end).fill("18:50");
  await step.getByLabel(team.sheet.reason).fill("ההפסקה נמשכה יותר");
  await step.getByRole("button", { name: team.breakStep.save }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: team.done.changeBreak }),
  ).toBeVisible();

  // Removed at once, with "ביטול" in the toast, which brings it back.
  await page.goto("/design/shell/clock/team/yoav?state=break");
  await step.getByLabel(team.sheet.reason).fill("נלחצה בטעות");
  await step.getByRole("button", { name: team.breakStep.remove }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const undo = page
    .getByRole("status")
    .filter({ hasText: team.done.removeBreak })
    .getByRole("button", { name: team.done.undo });
  await undo.click();
  await expect(
    page.getByRole("status").filter({ hasText: team.done.restoreBreak }),
  ).toBeVisible();

  // His break of today still runs: shown, and nothing to press but adding.
  await page.goto("/design/shell/clock/team/yoav?state=openBreak");
  await expect(breaks.getByText(team.breaks.running)).toBeVisible();
  await expect(breaks.getByRole("button")).toHaveCount(1);
});

// The switcher's twins (payroll P3b): the demo's accountant keeps the books of
// the restaurant, where she is, and of a shop with two unread lines. A desktop
// switches from the sidebar's menu; phones and tablets from Home's list and
// the profile's sheet, with the same words.
test("the switcher's demo offers both businesses on every screen", async ({
  page,
}, testInfo) => {
  const b = he.ui.businesses;
  const shop = /חנות הדגמה/;
  const unread = heT("ui.businesses.unread", { count: 2 });
  await page.goto("/design/shell/today/businesses");
  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("heading", { name: b.title })).toBeHidden();
    // The sidebar is the accountant's own, with no staff tab.
    const sidebar = page.locator("aside");
    await expect(
      sidebar.getByRole("link", { name: /גלית הדגמה/ }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: he.shell.nav.team, exact: true }),
    ).toHaveCount(0);
    // The shop's two lines show under the name before anything is pressed,
    // and the menu's name says them too.
    const elsewhere = { count: 2, businesses: 1 };
    await expect(
      page
        .getByText(heT("ui.businesses.unreadElsewhere", elsewhere))
        .filter({ visible: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: heT("ui.businesses.menuUnread", {
          name: "מסעדת הדגמה",
          ...elsewhere,
        }),
      })
      .click();
    await expect(
      page.getByRole("menuitemradio", { name: /מסעדת הדגמה/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("menuitemradio", { name: shop })).toContainText(
      unread,
    );
    // While it is open, Radix hides the rest of the page from screen readers:
    // the menu alone, then the whole page once it is closed.
    const open = await new AxeBuilder({ page })
      .include('[role="menu"]')
      .analyze();
    expect(open.violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    return;
  }
  await expect(
    page.getByRole("heading", { level: 2, name: b.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: shop }).filter({ visible: true }),
  ).toContainText(unread);
  await expect(
    page.getByText(b.here).filter({ visible: true }).first(),
  ).toBeVisible();

  await page.goto("/design/shell/me/businesses");
  await page.getByRole("button", { name: new RegExp(b.switch) }).click();
  const sheet = page.getByRole("dialog", { name: b.title });
  await expect(sheet.getByText(b.here)).toBeVisible();
  await expect(sheet.getByRole("button", { name: shop })).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

// The activity demo draws the breaks a correction changed: one cut, one removed.
test("the activity demo says which breaks a correction changed", async ({
  page,
}) => {
  await page.goto("/design/shell/manage/activity");
  // The headline up to its day, which the screen formats by the device.
  const [headline = ""] = heT("app.manage.activity.actions.clock.breakFit", {
    kind: "other",
    count: 2,
    person: "יואב לוי",
    day: "\u0000",
  }).split("\u0000");
  await expect(
    page.getByText(headline).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(he.app.manage.activity.actions.clock.breakRemoved)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// The activity demo names a role's permission as the roles screen does.
test("the activity demo says which permission a role gained or lost", async ({
  page,
}) => {
  await page.goto("/design/shell/manage/activity");
  const lines = [
    heT("app.manage.activity.actions.rolePermission.editOn", {
      role: "worker",
      area: he.modules.scheduling.name,
    }),
    heT("app.manage.activity.actions.rolePermission.extraOff", {
      role: "manager",
      extra: he.app.manage.roles.extras.schedule.publish.phrase,
    }),
  ];
  for (const line of lines) {
    await expect(
      page.getByText(line).filter({ visible: true }).first(),
    ).toBeVisible();
  }
});

// The activity demo says whose name was fixed, by who they are now, never the
// name it had or was given.
test("the activity demo says whose name was fixed", async ({ page }) => {
  await page.goto("/design/shell/manage/activity");
  await expect(
    page
      .getByText(
        heT("app.manage.activity.actions.member.name", { person: "נועה כהן" }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// The activity demo names the hiring file's parts that changed and why a view
// was refused (profile H4), never a value: the line holds no digit.
test("the activity demo names the file's fields, never a value", async ({
  page,
}) => {
  const e = he.app.manage.activity.actions.employee;
  await page.goto("/design/shell/manage/activity");
  const details = heT("app.manage.activity.actions.employee.details", {
    person: "נועה כהן",
    fields: `${e.fields.identity} ו${e.fields.address}`,
  });
  expect(details).not.toMatch(/\d/);
  await expect(
    page.getByText(details).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        heT("app.manage.activity.actions.employee.viewDenied", {
          person: "נועה כהן",
          reason: "not_holder",
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        heT("app.manage.activity.actions.member.emergency", {
          person: "נועה כהן",
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// The activity demo says what was cancelled at table 12 (waiter mode P3): the
// line's quantity and unit price, the price in an LTR span, the department
// after a separator, why and who sent it, and never a total.
test("the activity demo says what was cancelled, with its price", async ({
  page,
}) => {
  const o = he.app.manage.activity.actions.order;
  await page.goto("/design/shell/manage/activity");
  await expect(
    page
      .getByText(
        heT("app.manage.activity.actions.order.cancel", { name: "שניצל" }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        heT.markup("app.manage.activity.actions.order.quantity", {
          ltr: (chunks: string) => chunks,
          quantity: 2,
          price: "62.00 ₪",
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .locator('span[dir="ltr"]')
      .filter({ hasText: "62.00 ₪" })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  for (const note of [
    heT("app.manage.activity.actions.order.place", { name: "12" }),
    heT("app.manage.activity.actions.order.department", {
      department: "מטבח",
    }),
    heT("app.manage.activity.actions.order.reason", {
      reason: o.reasons.guest,
    }),
    heT("app.manage.activity.actions.order.sender", { person: "יואב לוי" }),
  ]) {
    await expect(
      page.getByText(note).filter({ visible: true }).first(),
    ).toBeVisible();
  }
  // Two at 62.00 ₪ are never added up.
  await expect(page.getByText("124.00").filter({ visible: true })).toHaveCount(
    0,
  );
});

// The activity demo names the app for what it did on its own: Sunday's floor
// opening, which nobody did, closed by the lists' job. On a computer the "who"
// cell is the app; on a phone or a tablet, the row's title over that line.
// Never "someone no longer in the app".
test("the activity demo names the app for a list it closed", async ({
  page,
}, testInfo) => {
  const a = he.app.manage.activity;
  const line = heT("app.manage.activity.actions.lists.missed", {
    name: "פתיחת אולם",
  });
  await page.goto("/design/shell/manage/activity");
  if (testInfo.project.name === "desktop") {
    await expect(
      page.getByRole("row").filter({ hasText: line }).getByRole("rowheader"),
    ).toHaveText(a.who.app);
  } else {
    await expect(
      page
        .getByText(a.who.app, { exact: true })
        .filter({ visible: true })
        .locator(".."),
    ).toContainText(line);
  }
  await expect(
    page.getByText(a.who.unknown).filter({ visible: true }),
  ).toHaveCount(0);
});

// The lists demo sends and takes a sending back, keeps its five minutes to
// take a finish back after it hydrates, and reads a freezer below zero.
test("the lists demo sends, takes back, and keeps a finished list as it was", async ({
  page,
}) => {
  const l = he.app.lists;
  await page.goto("/design/shell/lists/send");
  await page
    .getByRole("button", {
      name: l.send.submit.department.replace("{name}", "מטבח"),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/design\/shell\/lists\?sent=list-floor-opening$/,
  );
  await page
    .getByRole("status")
    .filter({ hasText: l.send.sent.replace("{to}", "לאולם") })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect(page).toHaveURL(/\/design\/shell\/lists$/);
  await expect(
    page.getByRole("status").filter({ hasText: l.send.cancelled }),
  ).toBeVisible();

  await page.goto("/design/shell/lists/list-kitchen-opening?state=finished");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: l.list.finished })
      .getByRole("button", { name: he.app.manage.undo }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: l.list.reopen })).toHaveCount(
    0,
  );
  // Nor a fix (L6b-1) while her own five minutes last.
  await expect(
    page.getByRole("button", { name: l.list.fix.action }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel(l.list.readingOf.replace("{label}", "מקפיא")),
  ).toHaveValue("-19");
});

// The template editor's demo (lists L3): an item added from its sheet saves
// itself and moves up, one already there opens in its own sheet, and an order
// whose asking department was removed holds its saves until another asks, or
// none (L5); the console's twin has nothing to send; a template whose
// department was removed sends to nobody until someone is chosen; a list
// typed now goes out from the send screen.
test("the template demo adds an item, moves it, and a typed list is sent", async ({
  page,
}) => {
  const l = he.app.lists;
  await page.goto("/design/shell/lists/templates/t-kitchen-opening");
  await page.getByRole("button", { name: l.items.add, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: l.items.newTitle });
  await sheet
    .getByRole("button", { name: l.items.kinds.number, exact: true })
    .click();
  await sheet.getByLabel(l.items.label, { exact: true }).fill("מקרר משקאות");
  await sheet
    .getByRole("button", {
      name: l.items.minusOf.replace("{field}", l.items.min),
    })
    .click();
  await sheet.getByLabel(l.items.min, { exact: true }).fill("1");
  await sheet.getByLabel(l.items.max, { exact: true }).fill("4");
  // The sheet hides the page from screen readers: axe on it alone.
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await sheet
    .getByRole("button", { name: l.items.create, exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: he.app.manage.saved }),
  ).toBeVisible();
  await expect(
    page.getByText("−1 – 4").filter({ visible: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: l.items.up.replace("{label}", "מקרר משקאות"),
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: l.items.down.replace("{label}", "מקרר משקאות"),
    }),
  ).toBeEnabled();

  // An item already there opens in its sheet, with the way to remove it.
  await page.getByRole("button", { name: /^מקפיא/ }).click();
  const existing = page.getByRole("dialog", { name: "מקפיא" });
  await expect(
    existing.getByRole("button", { name: l.items.remove, exact: true }),
  ).toBeVisible();
  await expect(existing.getByLabel(l.items.min, { exact: true })).toHaveValue(
    "25",
  );
  const sheetOpen = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(sheetOpen.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(existing).toBeHidden();

  // The bar's order after the bar was removed (L5): it says so and holds its
  // saves until another department asks, or none, which saves it as a list
  // of its own.
  await page.goto("/design/shell/lists/templates/t-bar-order?state=barGone");
  await expect(
    page.getByRole("status").filter({ hasText: l.templates.editor.askingGone }),
  ).toBeVisible();
  await expect(
    page.getByLabel(l.templates.editor.name, { exact: true }),
  ).toBeEnabled();
  // Named as it reads while the removed one holds it: still to choose.
  await page
    .getByRole("button", {
      name: `${l.templates.editor.asking}: ${l.templates.editor.choose}`,
    })
    .click();
  await page
    .getByRole("menuitemradio", {
      name: l.templates.editor.askingNone,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: he.app.manage.saved }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: l.templates.editor.askingGone }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: l.templates.editor.archive }),
  ).toBeVisible();

  await page.goto(
    "/design/console/businesses/demo-restaurant/lists/t-kitchen-opening",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "פתיחת מטבח" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: l.templates.editor.sendNow }),
  ).toHaveCount(0);

  // The kitchen's opening list after the kitchen was removed: nobody is
  // chosen for it, and the screen says why.
  await page.goto("/design/shell/lists/send?state=kitchenGone");
  await expect(
    page.getByRole("status").filter({ hasText: l.send.gone }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: l.send.choose, exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeDisabled();

  await page.goto("/design/shell/lists/send?template=new");
  await page.getByLabel(l.send.typedName, { exact: true }).fill("בדיקת בר");
  await page.getByRole("button", { name: l.items.add, exact: true }).click();
  await page
    .getByRole("dialog", { name: l.items.newTitle })
    .getByLabel(l.items.label, { exact: true })
    .fill("מילוי קרח");
  await page
    .getByRole("dialog", { name: l.items.newTitle })
    .getByRole("button", { name: l.items.create, exact: true })
    .click();
  await page
    .getByRole("button", { name: l.send.kinds.shift, exact: true })
    .click();
  await page.getByRole("radio", { name: /^ערב/ }).check();
  await page
    .getByRole("button", {
      name: l.send.submit.shift.replace("{name}", "ערב"),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/design\/shell\/lists\?sent=list-floor-opening$/,
  );
});

// The order demo (lists L5): the bar's order at the storeroom says how many
// were given and how many are short, and passes on from its sheet, which
// names where it goes; passed back, its timeline keeps the note; Lists shows
// it waiting elsewhere, and the department filter keeps the bar's lists.
test("the order demo gives counts, passes the list on, and filters by department", async ({
  page,
}, testInfo) => {
  const l = he.app.lists;
  const one = (text: string) =>
    /one \{([^}]*)\}/.exec(text)?.[1] ?? text.replace(/\{.*\}/, "");
  await page.goto("/design/shell/lists/list-bar-order");
  await expect(
    page.getByRole("spinbutton", {
      name: l.list.givenOf.replace("{label}", "יין לבן"),
    }),
  ).toHaveValue("4");
  await expect(
    page
      .getByText(
        (/other \{([^}]*)\}/.exec(l.list.short)?.[1] ?? "").replace("#", "2"),
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: l.list.pass.action }).click();
  const sheet = page.getByRole("dialog", { name: l.list.pass.title });
  await sheet.getByRole("radio", { name: /^בר/ }).check();
  await sheet
    .getByLabel(l.list.pass.note, { exact: true })
    .fill("חסר יין לבן, יגיע מחר");
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await sheet
    .getByRole("button", { name: l.list.pass.submit.replace("{name}", "בר") })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: l.list.pass.passed.replace("{name}", "בר") }),
  ).toBeVisible();

  // Passed back from the storeroom, with its note. A phone folds what
  // happened at the end: it opens first.
  await page.goto("/design/shell/lists/list-bar-order?state=passed");
  if (testInfo.project.name === "phone") {
    await page
      .locator("summary")
      .filter({ hasText: l.list.timeline.title })
      .filter({ visible: true })
      .click();
  }
  // It was sent to the storeroom, and passed from there to the bar.
  const [sentBefore = ""] = l.list.timeline.sent.split("{name}");
  await expect(
    page
      .getByText(
        new RegExp(
          `^${sentBefore}.+ ${l.card.to.department.replace("{name}", "מחסן")},`,
        ),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        l.list.timeline.note.replace(
          "{note}",
          "יין לבן יגיע מחר בבוקר. השאר כאן.",
        ),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  // Lists: the bar's order waits at the storeroom; the bar's lists alone.
  await page.goto("/design/shell/lists");
  await expect(
    page.getByRole("heading", { name: one(l.asked) }).filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: l.filter.menu
        .replace("{label}", l.filter.label)
        .replace("{name}", l.filter.all),
    })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "בר", exact: true }).click();
  await expect(page).toHaveURL(/\/design\/shell\/lists\?department=dep-bar$/);
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: /^הזמנה מהבר למחסן/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: /^פתיחת אולם/ })
      .filter({ visible: true }),
  ).toHaveCount(0);
});

// Photos on a list (L6), on the weekly cleaning's demo: a photo taken from the
// phone's chooser shows at once and says it was saved; removing it offers an
// undo that brings it back; a demo business says it takes none, with no way
// to take one; one past the days the business keeps photos says so; and the
// finished list shows the photo with who took it.
test("the photo demo takes a photo, removes it and brings it back", async ({
  page,
}) => {
  const l = he.app.lists.list;
  const main = page.getByRole("main");
  const label = "צילום של המטבח אחרי הניקיון";
  const photo = main.getByRole("img", {
    name: l.photo.alt.replace("{label}", label),
  });

  await page.goto("/design/shell/lists/list-weekly-cleaning");
  await expect(photo).toBeVisible();
  await expect(
    main.getByRole("button", { name: new RegExp(`^${l.photo.take}`) }),
  ).toHaveCount(0);

  await page.goto("/design/shell/lists/list-weekly-cleaning?state=photo");
  await expect(photo).toHaveCount(0);
  const take = main.getByRole("button", { name: `${l.photo.take}: ${label}` });
  await expect(take).toBeVisible();
  await expect(main.getByText(l.photo.takeHint)).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await take.click();
  await (await chooser).setFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await cameraPhoto(page),
  });
  await expect(
    page.getByRole("status").filter({ hasText: l.photo.saved }),
  ).toBeVisible();
  await expect(photo).toBeVisible();
  await expect(
    main.getByRole("button", { name: `${l.photo.replace}: ${label}` }),
  ).toBeVisible();
  const taken = await new AxeBuilder({ page }).analyze();
  expect(taken.violations.map((v) => v.id)).toEqual([]);

  await main
    .getByRole("button", { name: `${l.photo.remove}: ${label}` })
    .click();
  const undo = page.getByRole("status").filter({ hasText: l.photo.removed });
  await expect(undo).toBeVisible();
  await expect(photo).toHaveCount(0);
  await undo.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(photo).toBeVisible();
  await expect(undo).toHaveCount(0);

  await page.goto("/design/shell/lists/list-weekly-cleaning?state=demo");
  await expect(main.getByText(l.photo.demo, { exact: true })).toBeVisible();
  await expect(
    main.getByRole("button", { name: new RegExp(`^${l.photo.take}`) }),
  ).toHaveCount(0);

  await page.goto("/design/shell/lists/list-weekly-cleaning?state=gone");
  await expect(
    main.getByText(heT("app.lists.list.photo.removedAfter")),
  ).toBeVisible();
  await expect(photo).toHaveCount(0);
});

// Each item's story on the demo (L6a): the line under the fridge names who
// changed its reading last (Itay, after Noa's), with how many more changes,
// and opens the sheet that lists all three with names and times; a tick
// taken back says so on its line. The sheet is clean in both appearances, and
// on a computer the readings table's "who" opens the same story.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`an item's story, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test("the history demo opens an item's story from its line", async ({
      page,
    }, testInfo) => {
      const h = he.app.lists.list.history;
      const path = "/design/shell/lists/list-kitchen-opening?state=history";
      const literal = (text: string) =>
        text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const storyOf = (label: string) =>
        new RegExp(
          `^${literal(heT("app.lists.list.history.open", { label }))}:\\s`,
        );
      const main = page.getByRole("main");
      const sheet = page.getByRole("dialog", { name: h.title });

      await page.goto(path);
      // Under the item, with its time (the readings table's has none).
      const fridge = main
        .getByRole("button", { name: storyOf("מקרר ראשי") })
        .filter({ visible: true, hasText: "08:02" });
      await expect(fridge).toHaveCount(1);
      await expect(fridge).toContainText("איתי מזרחי");
      await expect(fridge).toContainText(
        heT("app.lists.list.history.more", { count: 2 }),
      );
      const surfaces = main
        .getByRole("button", { name: storyOf("ניקוי משטחי עבודה") })
        .filter({ visible: true });
      await expect(surfaces).toContainText(h.unchecked);
      await expect(surfaces).toContainText("08:08");
      await expect(surfaces).toContainText(
        heT("app.lists.list.history.more", { count: 1 }),
      );

      await fridge.click();
      await expect(sheet).toBeVisible();
      for (const text of [
        "נועה כהן",
        "07:42",
        "איתי מזרחי",
        "08:02",
        "08:05",
        "הדלת נשארה פתוחה",
      ]) {
        await expect(sheet).toContainText(text);
      }
      await expectCleanPage(page, path, true);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();

      if (testInfo.project.name === "desktop") {
        const who = main
          .getByRole("table")
          .getByRole("button", { name: storyOf("מקרר ראשי") });
        await expect(who).toContainText("איתי מזרחי");
        await expect(who).toContainText(
          heT("app.lists.list.history.more", { count: 2 }),
        );
        await who.click();
        await expect(sheet).toContainText("נועה כהן");
        await expect(sheet).toContainText("08:05");
      }
    });
  });
}

// Fixing a closed list on the demo (L6b-1): Shiran, who runs the lists, has
// "תיקון הרשימה" where opening it again was; being fixed, the list says it
// stays closed, keeps a required tick, refuses to empty a required reading
// and saves a new one at once as a fix; "סיום התיקון" says it was saved.
// Fixed, the list says so after who closed it, the item names its fixer
// with the mark the sheet repeats, and the manager's day says it too.
test("the fix demo fixes a closed list in place and marks what was fixed", async ({
  page,
}) => {
  const l = he.app.lists.list;
  const main = page.getByRole("main");
  const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plain = (text: string, values: Record<string, string>) =>
    Object.entries(values).reduce(
      (out, [key, value]) => out.replaceAll(`{${key}}`, value),
      text.replaceAll(/<\/?ltr>/g, ""),
    );

  await page.goto("/design/shell/lists/list-weekly-cleaning");
  await expect(main.getByRole("button", { name: l.fix.action })).toBeVisible();
  await expect(
    main.getByRole("button", { name: l.reopen, exact: true }),
  ).toHaveCount(0);

  await page.goto("/design/shell/lists/list-kitchen-opening?state=fix");
  const card = main.getByRole("region", { name: l.fix.title });
  await expect(card).toContainText("נועה כהן");
  await expect(
    card.getByRole("button", { name: l.fix.reopenAll }),
  ).toBeVisible();
  // A required tick taken back stays ticked, and says why.
  const surfaces = main.getByRole("checkbox", { name: "ניקוי משטחי עבודה" });
  await expect(surfaces).toBeChecked();
  await surfaces.click();
  await expect(
    page.getByRole("status").filter({ hasText: l.failed.keepRequired }),
  ).toBeVisible();
  await expect(surfaces).toBeChecked();
  const freezer = main.getByLabel(l.readingOf.replace("{label}", "מקפיא"));
  await freezer.fill("");
  await freezer.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: l.failed.keepRequired }),
  ).toBeVisible();
  await expect(freezer).toHaveValue("12");
  await freezer.fill("19");
  await freezer.press("Enter");
  const story = main
    .getByRole("button", {
      name: new RegExp(
        `^${literal(heT("app.lists.list.history.open", { label: "מקפיא" }))}:\\s`,
      ),
    })
    .filter({ visible: true })
    .first();
  await expect(story).toContainText(l.fix.item);
  await page
    .getByRole("button", { name: l.fix.done })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: l.fix.saved }),
  ).toBeVisible();
  await expect(card).toHaveCount(0);
  // The keyboard is back where the fix began.
  await expect(main.getByRole("button", { name: l.fix.action })).toBeFocused();

  await page.goto("/design/shell/lists/list-kitchen-opening?state=fixed");
  const hero = main.getByRole("region", { name: l.progressLabel });
  await expect(hero).toContainText("נועה כהן");
  await expect(hero).toContainText(
    plain(he.app.lists.card.fixed, { time: "08:10" }),
  );
  const fixed = main
    .getByRole("button", {
      name: new RegExp(
        `^${literal(heT("app.lists.list.history.open", { label: "מקפיא" }))}:\\s`,
      ),
    })
    .filter({ visible: true, hasText: "08:10" });
  await expect(fixed).toHaveCount(1);
  await expect(fixed).toContainText(l.fix.item);
  await expect(fixed).toContainText("שירן");
  await fixed.click();
  const sheet = page.getByRole("dialog", { name: l.history.title });
  await expect(sheet).toContainText(l.fix.badge);
  await expect(sheet).toContainText("נועה כהן");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.goto("/design/shell/lists/today?state=fixed");
  await expect(
    main
      .getByText(plain(he.app.lists.card.fixed, { time: "08:10" }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    main
      .getByText(new RegExp(`·\\s${literal(l.readings.fixed)}$`))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// Fixing closed lists at view (L6b-2), for Omer of the kitchen, in "עובד
// בכיר": the hero says until when, a day after Noa closed it; being fixed,
// the card has no way to open it again for everyone, and a required reading
// refused empty says to ask whoever runs the lists. His fix is his.
test("the fix demo for a role given fixing closed lists fixes for a day, never opening it for everyone", async ({
  page,
}) => {
  const l = he.app.lists.list;
  const main = page.getByRole("main");
  const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plain = (text: string, values: Record<string, string>) =>
    Object.entries(values).reduce(
      (out, [key, value]) => out.replaceAll(`{${key}}`, value),
      text.replaceAll(/<\/?ltr>/g, ""),
    );
  const path = "/design/shell/lists/list-kitchen-opening?state=fix-worker";

  await page.goto(path);
  const hero = main.getByRole("region", { name: l.progressLabel });
  await expect(hero).toContainText("נועה כהן");
  await expect(hero).toContainText(
    plain(l.fix.untilOn, { date: "4.11", time: "08:05" }),
  );
  await expect(
    main.getByRole("button", { name: l.reopen, exact: true }),
  ).toHaveCount(0);
  await expectCleanPage(page, path);

  await main.getByRole("button", { name: l.fix.action }).click();
  const card = main.getByRole("region", { name: l.fix.title });
  await expect(card).toContainText("נועה כהן");
  await expect(card.getByRole("button", { name: l.fix.reopenAll })).toHaveCount(
    0,
  );
  const freezer = main.getByLabel(l.readingOf.replace("{label}", "מקפיא"));
  await freezer.fill("");
  await freezer.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: l.failed.keepRequiredAsk }),
  ).toBeVisible();
  await expect(freezer).toHaveValue("12");
  await freezer.fill("19");
  await freezer.press("Enter");
  const story = main
    .getByRole("button", {
      name: new RegExp(
        `^${literal(heT("app.lists.list.history.open", { label: "מקפיא" }))}:\\s`,
      ),
    })
    .filter({ visible: true })
    .first();
  await expect(story).toContainText(l.fix.item);
  await expect(story).toContainText("עומר אזולאי");
  await expectCleanPage(page, path);
});

// "עוד אפשר לתקן" (L6b-2): Noa, given fixing closed lists, has yesterday's
// opening, which she closed, after today's closed lists, while its day
// lasts; without it there is no such section.
test("the lists demo keeps yesterday's closed list to fix for whoever may", async ({
  page,
}) => {
  const main = page.getByRole("main");
  const title = heT("app.lists.fixable.title", { count: 1 });
  // Yesterday's opening, apart from this morning's of the same name.
  const yesterday = main
    .locator('a[href$="/lists/list-kitchen-opening-mon"]')
    .filter({ visible: true });
  await page.goto("/design/shell/lists/worker?state=fixable");
  await expect(
    main
      .getByRole("heading", { level: 2, name: title })
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    main.getByText(he.app.lists.fixable.hint).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(yesterday).toHaveCount(1);
  // It says the day it closed, beside today's of the same name, and until
  // when it can be fixed, this morning.
  const plain = (text: string, values: Record<string, string>) =>
    Object.entries(values).reduce(
      (out, [key, value]) => out.replaceAll(`{${key}}`, value),
      text.replaceAll(/<\/?ltr>/g, ""),
    );
  await expect(
    main
      .getByText(
        plain(he.app.lists.card.finishedByOn, {
          date: "2.11",
          time: "08:20",
          name: "נועה כהן",
        }),
      )
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    main
      .getByText(plain(he.app.lists.list.fix.until, { time: "08:20" }))
      .filter({ visible: true }),
  ).toHaveCount(1);
  await page.goto("/design/shell/lists/worker");
  await expect(
    main.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(main.getByText(title)).toHaveCount(0);
  await expect(yesterday).toHaveCount(0);
});

// Orel's case on the roles twin (L6b-2): "עובד בכיר" keeps lists at view
// with "תיקון רשימות שנסגרו" on, marked "שונה" against workers. The switch
// changes at view, with its own toast and undo; raising lists to edit holds
// it, on and locked, "כלול בעריכה", and says only what raising always said.
// Nothing is stored.
test("the roles demo gives a senior role fixing closed lists at view, which edit covers", async ({
  page,
}, testInfo) => {
  const r = he.app.manage.roles;
  const lists = he.modules.lists.name;
  const senior = "עובד בכיר";
  const main = page.getByRole("main");
  const fix = (role: string) =>
    main
      .getByRole("switch", {
        name: heT("app.manage.roles.extraLabel", {
          extra: r.extras.lists.fix.label,
          role,
        }),
      })
      .filter({ visible: true });
  const edit = main
    .getByRole("switch", {
      name: heT("app.manage.roles.editLabel", { area: lists, role: senior }),
    })
    .filter({ visible: true });
  const covered = main
    .getByText(r.coveredByEdit, { exact: true })
    .filter({ visible: true });
  const toast = (text: string) =>
    main.getByRole("status").filter({ hasText: text });

  const path = "/design/shell/manage/roles?state=senior&role=senior";
  await page.goto(path);
  await expect(edit).toHaveAttribute("aria-checked", "false");
  await expect(fix(senior)).toHaveAttribute("aria-checked", "true");
  await expect(fix(senior)).toBeEnabled();
  if (testInfo.project.name === "desktop") {
    // Workers start without it, live at view; managers hold it with edit.
    await expect(fix(he.app.team.roles.worker)).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(fix(he.app.team.roles.worker)).toBeEnabled();
    await expect(fix(he.app.team.roles.manager)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(fix(he.app.team.roles.manager)).toBeDisabled();
  }
  await expectCleanPage(page, path);

  await fix(senior).click();
  await expect(fix(senior)).toHaveAttribute("aria-checked", "false");
  const off = toast(
    heT("app.manage.roles.done.extraOff", {
      role: senior,
      extra: r.extras.lists.fix.phrase,
    }),
  );
  await expect(off).toBeVisible();
  await off.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(toast(r.done.undone)).toBeVisible();
  await expect(fix(senior)).toHaveAttribute("aria-checked", "true");

  const coveredBefore = await covered.count();
  await edit.click();
  await expect(edit).toHaveAttribute("aria-checked", "true");
  await expect(fix(senior)).toHaveAttribute("aria-checked", "true");
  await expect(fix(senior)).toBeDisabled();
  await expect(covered).toHaveCount(coveredBefore + 1);
  await expect(
    toast(
      heT("app.manage.roles.done.editWith", {
        role: senior,
        area: lists,
        extras: r.extras.lists.send.phrase,
      }),
    ),
  ).toBeVisible();
  await expectCleanPage(page, path);
});

// In a demo business, which takes no photos (L6), the template editor keeps a
// photo item optional, so its list can still be finished: "חובה" is off and
// still, and the sheet says why, for an item already there and a new one.
test("the template demo keeps a photo item optional in a demo business", async ({
  page,
}) => {
  const l = he.app.lists;
  const label = "צילום של המטבח אחרי הניקיון";
  await page.goto("/design/shell/lists/templates/t-weekly-cleaning?state=demo");
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  const sheet = page.getByRole("dialog", { name: label });
  const required = sheet.getByRole("switch", {
    name: l.items.required,
    exact: true,
  });
  await expect(required).toBeDisabled();
  await expect(required).toHaveAttribute("aria-checked", "false");
  await expect(sheet.getByText(l.items.photoOptional)).toBeVisible();
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: l.items.add, exact: true }).click();
  const added = page.getByRole("dialog", { name: l.items.newTitle });
  await expect(
    added.getByRole("switch", { name: l.items.required, exact: true }),
  ).toBeEnabled();
  await added
    .getByRole("button", { name: l.items.kinds.photo, exact: true })
    .click();
  await expect(
    added.getByRole("switch", { name: l.items.required, exact: true }),
  ).toBeDisabled();
  await expect(added.getByText(l.items.photoOptional)).toBeVisible();
});

// The pay demo's wage (payroll P4): under the minimum warns in words and
// still saves, and the sheet's button says from when.
test("the pay demo sets a wage, and warns under the minimum", async ({
  page,
}) => {
  await page.goto("/design/shell/clock/pay/noa");
  await page
    .getByRole("button", { name: he.app.pay.wage.change })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel(he.app.pay.wage.sheet.amount).fill("30");
  const warning = heT.markup("app.pay.wage.warning", {
    ltr: (chunks: string) => chunks,
    band: "adult",
    from: "1.4.2026",
    minimum: "35.40 ₪",
  });
  await expect(sheet.getByText(warning)).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await sheet
    .getByRole("button", {
      name: heT("app.pay.wage.sheet.save", { date: "1.11" }),
    })
    .click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.pay.wage.done", { date: "1.11.2026" }),
    }),
  ).toBeVisible();
});

// The pay demo's details (payroll P5): a start copied from joining is marked,
// a minor's birth date says what it makes of her age and is never kept, and
// a period that overlaps another is refused in words.
test("the pay demo's details: a joined start, a birth date, and periods that never overlap", async ({
  page,
}) => {
  const d = he.app.pay.details;
  const parts = he.app.pay.dateParts;
  await page.goto("/design/shell/clock/pay/noa");
  await expect(
    page.getByText(d.joined).filter({ visible: true }).first(),
  ).toBeVisible();

  await page.goto("/design/shell/clock/pay/maya");
  await expect(
    page.getByText(d.numberMissing, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: d.edit })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", {
    name: heT("app.pay.details.sheet.title", { name: "מאיה פרץ" }),
  });
  const birth = sheet.getByRole("group", { name: d.sheet.birth });
  await birth.getByLabel(parts.day, { exact: true }).fill("15");
  await birth.getByLabel(parts.month, { exact: true }).fill("4");
  await birth.getByLabel(parts.year, { exact: true }).fill("2009");
  await expect(
    sheet.getByText(
      heT.markup("app.pay.details.sheet.birthYouth", {
        ltr: (chunks: string) => chunks,
        until: "4.2027",
      }),
    ),
  ).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await sheet.getByRole("button", { name: d.sheet.save }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: d.done }),
  ).toBeVisible();

  // Yoav worked here from June to December 2024: October 2024 overlaps.
  await page.goto("/design/shell/clock/pay/yoav");
  await page
    .getByRole("button", { name: d.addPeriod })
    .filter({ visible: true })
    .click();
  const period = page.getByRole("dialog", {
    name: heT("app.pay.details.period.titleNew", { name: "יואב לוי" }),
  });
  const from = period.getByRole("group", { name: d.period.from });
  await from.getByLabel(parts.day, { exact: true }).fill("1");
  await from.getByLabel(parts.month, { exact: true }).fill("10");
  await from.getByLabel(parts.year, { exact: true }).fill("2024");
  const to = period.getByRole("group", { name: d.period.to });
  await to.getByLabel(parts.day, { exact: true }).fill("31");
  await to.getByLabel(parts.month, { exact: true }).fill("10");
  await to.getByLabel(parts.year, { exact: true }).fill("2024");
  await period.getByRole("button", { name: d.period.save }).click();
  await expect(
    period.getByText(
      heT("app.pay.details.period.errors.overlap", { name: "יואב לוי" }),
    ),
  ).toBeVisible();
});

// The pay demo by the hours engine (payroll P7): Yoav's election day not
// worked is paid, with what to check; Maya's short breaks are in words; the
// way it is worked out opens in a sheet, with how each of Yoav's weeks was
// read, and the clock's own estimate has the worker's words, without them.
test("the pay demo's rates: a day not worked paid, remarks in words, and how it is worked out", async ({
  page,
}) => {
  const p = he.app.pay;
  const flat = (key: Parameters<typeof heT.markup>[0], values = {}) =>
    heT.markup(key, { ltr: (chunks: string) => chunks, ...values });
  await page.goto("/design/shell/clock/pay/yoav");
  await expect(
    page
      .getByText(
        flat("app.pay.holidayPay.oneOff", {
          day: he.modules.time_clock.oneOffRestDays.knesset_2026,
          date: "27.10",
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(heT("app.pay.holidayPay.checks.wasScheduled", { form: "m" }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(p.estimate.label, { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: p.method.open })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", { name: p.method.title });
  await expect(sheet.getByText(p.method.weeks.title)).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await sheet.getByRole("button", { name: p.method.close }).click();
  await expect(sheet).toBeHidden();

  // Without amounts: the rates stay, and no estimate.
  await page.goto("/design/shell/clock/pay/yoav?estimate=off");
  await expect(
    page.getByText(p.estimate.offShort).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText(p.estimate.label, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);

  // The month's card names Maya's short breaks, first of the minors.
  await page.goto("/design/shell/clock/pay");
  await expect(
    page
      .getByText(
        flat("modules.time_clock.payroll.flags.minorBreak", {
          date: "1.10",
          minutes: 30,
        }),
      )
      .first(),
  ).toBeVisible();

  // The clock: Noa's own month, before tax, and the way it is worked out
  // without what waits for an accountant.
  await page.goto("/design/shell/clock");
  await expect(
    page.getByText(he.app.clock.ownPay.label, { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: p.method.open }).click();
  const own = page.getByRole("dialog", { name: p.method.title });
  await expect(own.getByText(p.method.excluded)).toBeVisible();
  await expect(own.getByText(p.method.readings)).toHaveCount(0);
  await page.goto("/design/shell/clock?estimate=off");
  await expect(
    page.getByText(he.app.clock.ownPay.label, { exact: true }),
  ).toHaveCount(0);
});

// What the hours list counts and what the rates leave out agree in words: a
// shift still open is said apart, holiday pay is listed where it is counted,
// and "nothing to check" waits for both shifts and remarks.
test("the pay demo says what it counts: open shifts, holiday pay and remarks", async ({
  page,
}) => {
  const p = he.app.pay;
  const flat = (key: Parameters<typeof heT.markup>[0], values = {}) =>
    heT.markup(key, { ltr: (chunks: string) => chunks, ...values });
  // Shiran's shift left open: in the month's hours, not yet in the rates.
  await page.goto("/design/shell/clock/pay");
  await expect(
    page
      .getByText(heT("app.pay.beforePayroll.open", { count: 1 }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.goto("/design/shell/clock/pay/shiran");
  await expect(
    page
      .getByText(heT("app.pay.beforePayroll.open", { count: 1 }))
      .filter({ visible: true }),
  ).toHaveCount(1);

  // Yoav's election day not worked is in his remarks, where it is counted.
  await page.goto("/design/shell/clock/pay/yoav");
  await expect(
    page
      .getByText(
        flat("app.pay.remarks.oneOff", {
          day: he.modules.time_clock.oneOffRestDays.knesset_2026,
          date: "27.10",
        }),
      )
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText(p.remarks.none).filter({ visible: true }),
  ).toHaveCount(0);

  // Every shift approved and closed, remarks still to check: the hero names
  // the people and the remarks, and no "nothing to check".
  await page.goto("/design/shell/today/accountant?state=checked");
  const escapeText = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const people = escapeText(heT("app.pay.captionParts.people", { count: 4 }));
  const remarks = escapeText(
    heT("app.pay.captionParts.remarks", { count: 2 }),
  ).replace("2", "\\d+");
  await expect(
    page.getByText(new RegExp(`^${people} · ${remarks}$`)),
  ).toBeVisible();
  await expect(
    page.getByText(new RegExp(escapeText(p.captionParts.nothing))),
  ).toHaveCount(0);

  // At work, Noa's own card says the shift she is in counts once it ends.
  await page.goto("/design/shell/clock?state=working");
  await expect(
    page.getByText(heT("app.clock.ownPay.openShift", { count: 1 })),
  ).toBeVisible();
});

// The file for payroll on the demo (payroll P8): the main action downloads
// the demo's October, four sheets right to left, and says when the last file
// went out, warned once the hours changed since.
test("the pay demo's file: its action, what it holds, and the workbook", async ({
  page,
}, testInfo) => {
  const f = he.app.pay.file;
  await page.goto("/design/shell/clock/pay?file=changed");
  const action = page.getByRole("link", { name: f.download });
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute(
    "href",
    "/design/shell/clock/pay/export?month=2026-10",
  );
  await expect(page.getByText(f.what).filter({ visible: true })).toBeVisible();
  const changed = heT.markup("app.pay.file.changed", {
    ltr: (chunks: string) => chunks,
    month: "אוקטובר 2026",
    date: "3.11",
    time: "10:00",
  });
  await expect(page.getByText(changed).filter({ visible: true })).toBeVisible();

  if (testInfo.project.name !== "desktop") return;
  const download = page.waitForEvent("download");
  await action.click();
  const file = await download;
  const bytes = readFileSync(await file.path());
  const { sheets, strings } = readWorkbook(unzip(bytes));
  expect(sheets.map((sheet) => sheet.name)).toEqual([
    f.sheets.summary,
    f.sheets.daily,
    f.sheets.check,
    f.sheets.about,
  ]);
  for (const sheet of sheets) expect(sheet.xml).toContain('rightToLeft="1"');
  expect(strings).toContain("אוקטובר 2026");
  // Noa's payroll number stays text, and her correction keeps its reason.
  expect(strings).toContain("102");
  expect(strings).toContain("שכחה לצאת");
});

// Closing a month on the demo (payroll P9): the owner closes October beside
// its file, with no "are you sure"; once closed, the header says when and by
// whom, a day changed since says where it goes, and reopening asks why. A
// manager reads it closed, with nothing to press; the month after a closed
// and changed one has its differences in its file, even with no hours of its
// own; a wage can't start in a closed month, and the sheet says from when.
test("the pay demo closes a month, says so, and reopens it with a reason", async ({
  page,
}, testInfo) => {
  const c = he.app.pay.close;
  const r = he.app.pay.reopen;
  const flat = (key: Parameters<typeof heT.markup>[0], values = {}) =>
    heT.markup(key, { ltr: (chunks: string) => chunks, ...values });

  // Ended and not closed: the file first, closing beside it, and what then.
  await page.goto("/design/shell/clock/pay");
  await expect(
    page.getByRole("link", { name: he.app.pay.file.download }),
  ).toBeVisible();
  const close = page.getByRole("button", { name: c.action });
  await expect(close).toBeVisible();
  await expect(page.getByText(c.hint).filter({ visible: true })).toBeVisible();
  await close.click();
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.pay.close.done", { month: "אוקטובר 2026" }),
    }),
  ).toBeVisible();

  // Closed by Galit: the header says so, and closing gives way to reopening.
  await page.goto("/design/shell/clock/pay?close=closed");
  await expect(
    page
      .getByText(
        flat("app.pay.close.closedBy", { date: "3.11", name: "גלית הדגמה" }),
      )
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: c.action })).toHaveCount(0);
  await expect(page.getByText(c.hint)).toHaveCount(0);
  await page.getByRole("button", { name: r.action }).click();
  const sheet = page.getByRole("dialog", {
    name: heT("app.pay.reopen.title", { month: "אוקטובר 2026" }),
  });
  await expect(sheet).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  // A reason is needed, said under its field.
  await sheet.getByRole("button", { name: r.save }).click();
  await expect(sheet.getByText(r.reasonNeeded)).toBeVisible();
  await sheet.getByLabel(r.reason).fill("חסרה משמרת של יואב");
  await sheet.getByRole("button", { name: r.save }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.pay.reopen.done", { month: "אוקטובר 2026" }),
    }),
  ).toBeVisible();

  // A day changed since it closed: it goes into November's file.
  await page.goto("/design/shell/clock/pay?close=changed");
  await expect(
    page
      .getByText(heT("app.pay.diff.changed", { count: 1, next: "נובמבר 2026" }))
      .filter({ visible: true }),
  ).toBeVisible();

  // A manager with pay access reads it closed, and presses nothing.
  await page.goto("/design/shell/clock/pay?close=manager");
  await expect(
    page
      .getByText(
        flat("app.pay.close.closedBy", { date: "3.11", name: "גלית הדגמה" }),
      )
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: r.action })).toHaveCount(0);
  await expect(page.getByRole("button", { name: c.action })).toHaveCount(0);

  // September closed and changed: October's file says it holds them, and
  // the demo's file does.
  const inFile = heT("app.pay.diff.inFile", {
    month: "ספטמבר 2026",
    count: 2,
  });
  const sheetsOf = async (href: string) => {
    const response = await page.request.get(href);
    expect(response.ok()).toBe(true);
    return readWorkbook(unzip(await response.body())).sheets.map(
      (one) => one.name,
    );
  };
  const names = he.app.pay.file.sheets;
  const withDifferences = [
    names.summary,
    names.daily,
    names.check,
    names.differences,
    names.about,
  ];
  await page.goto("/design/shell/clock/pay?close=before");
  await expect(page.getByText(inFile).filter({ visible: true })).toBeVisible();
  const before = page.getByRole("link", { name: he.app.pay.file.download });
  await expect(before).toHaveAttribute(
    "href",
    "/design/shell/clock/pay/export?close=before&month=2026-10",
  );
  if (testInfo.project.name === "desktop") {
    expect(
      await sheetsOf(
        "/design/shell/clock/pay/export?close=before&month=2026-10",
      ),
    ).toEqual(withDifferences);
    expect(
      await sheetsOf("/design/shell/clock/pay/export?month=2026-10"),
    ).not.toContain(names.differences);
  }

  // An October with no hours of its own still has its file, for them.
  await page.goto("/design/shell/clock/pay?close=empty");
  await expect(
    page
      .getByText(heT("app.pay.empty.title", { month: "אוקטובר 2026" }))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText(inFile).filter({ visible: true })).toBeVisible();
  const empty = page.getByRole("link", { name: he.app.pay.file.download });
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute(
    "href",
    "/design/shell/clock/pay/export?close=empty&month=2026-10",
  );
  await expect(page.getByRole("button", { name: c.action })).toHaveCount(0);
  if (testInfo.project.name === "desktop") {
    expect(
      await sheetsOf(
        "/design/shell/clock/pay/export?close=empty&month=2026-10",
      ),
    ).toEqual(withDifferences);
  }

  // A wage can't start in the closed month, in words, and the sheet says
  // from when it may.
  await page.goto("/design/shell/clock/pay/noa?close=closed");
  await page
    .getByRole("button", { name: he.app.pay.wage.change })
    .filter({ visible: true })
    .click();
  const wage = page.getByRole("dialog");
  await expect(
    wage.getByText(
      flat("app.pay.wage.sheet.fromHintClosed", {
        month: "אוקטובר 2026",
        date: "1.11.2026",
      }),
    ),
  ).toBeVisible();
  await wage.getByLabel(he.app.pay.wage.sheet.amount).fill("40");
  await wage.getByLabel(he.app.pay.wage.sheet.from).fill("2026-10-15");
  await wage.getByRole("button", { name: /^שמירת השכר/ }).click();
  await expect(
    wage.getByText(he.app.pay.wage.errors.from.closed),
  ).toBeVisible();
});

// A template's times in the editor's demo (lists L4): a saved time says when
// it is sent next, a paused one says so, and a time added in its sheet, here
// one that follows a shift, saves itself and says when it goes; the sheet is
// clean. The manager's day leads to a list from its table, late first, and
// the week on top opens a day of the history.
test("the times demo adds a time by a shift, and the day's overview reads its history", async ({
  page,
}) => {
  const ls = he.app.lists.schedules;
  const lo = he.app.lists.overview;
  await page.goto("/design/shell/lists/templates/t-kitchen-opening");
  // Tuesday at 08:12: today's opening went at 07:30, the next is tomorrow.
  await expect(
    page.getByRole("button", { name: /07:30/ }).filter({ hasText: "עד" }),
  ).toContainText(ls.next.tomorrow.replace("<ltr>{time}</ltr>", "07:30"));

  await page.getByRole("button", { name: ls.add, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: ls.sheet.newTitle });
  await sheet
    .getByRole("button", { name: ls.sheet.anchors.shift, exact: true })
    .click();
  await expect(
    sheet
      .getByRole("button", { name: new RegExp(`^${ls.sheet.shift}`) })
      .first(),
  ).toBeVisible();
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await sheet
    .getByRole("button", { name: ls.sheet.create, exact: true })
    .click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: he.app.manage.saved }),
  ).toBeVisible();

  // The weekly cleaning's time is paused.
  await page.goto("/design/shell/lists/templates/t-weekly-cleaning");
  await expect(page.getByText(ls.next.paused).first()).toBeVisible();

  // With the evening gone from the settings, the bar's closing says on top
  // that its time holds the saves, and the way to it opens that time.
  await page.goto(
    "/design/shell/lists/templates/t-bar-closing?state=shiftGone",
  );
  const held = page.getByRole("status").filter({
    hasText: heT("app.lists.templates.editor.held", { count: 1 }),
  });
  await expect(held).toBeVisible();
  await held
    .getByRole("button", { name: he.app.lists.templates.editor.fixTime })
    .click();
  await expect(
    page.getByRole("dialog", { name: ls.sheet.title }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/design/shell/lists/today");
  await expect(
    page
      .getByText(heT("app.lists.overview.readings.outOfRange", { count: 1 }), {
        exact: true,
      })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  // Monday's dot says what it has to look at: last night's closing, late,
  // with its fridge out of range.
  await expect(
    page
      .getByRole("group", { name: lo.pick })
      .getByRole("button", { name: /^ב׳\s*2(\s|$)/ }),
  ).toContainText(heT("app.lists.overview.readings.outOfRange", { count: 1 }));
  // Sunday the 1st, five days before.
  await page
    .getByRole("group", { name: lo.pick })
    .getByRole("button", { name: /^א׳\s*1(\s|$)/ })
    .click();
  await expect(page).toHaveURL(
    /\/design\/shell\/lists\/today\?day=2026-11-01$/,
  );
  // Sunday's floor opening nobody did: a section of its own on a phone and
  // a tablet, a row in the table on a computer.
  await expect(
    page
      .getByText(heT("app.lists.overview.sections.missed", { count: 1 }))
      .first(),
  ).toBeAttached();
  await expect(
    page.getByText("פתיחת אולם").filter({ visible: true }).first(),
  ).toBeVisible();
});

// Pictures in the chat demo (C4): Noa's photo in the kitchen opens whole in a
// sheet, with what she wrote under it; one picked from the attach button is
// made ready on the page as the app makes it, shown over the field, and goes
// with the next message; the removed desserts group keeps a message whose
// picture is no longer kept, and says so.
test("the chat demo opens a picture whole, sends a picked photo, and says when a file is no longer kept", async ({
  page,
}) => {
  const c = he.app.chat;
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  const alt = c.image.alt.replace("{name}", "נועה כהן");

  await page.goto("/design/chat/kitchen");
  await log.getByRole("img", { name: alt }).click();
  const sheet = page.getByRole("dialog", { name: alt });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("ככה המטבח נראה עכשיו")).toBeVisible();
  // The sheet hides the page from screen readers while it is open: axe alone.
  const opened = await new AxeBuilder({ page }).analyze();
  expect(opened.violations.map((v) => v.id)).toEqual([]);
  await sheet.getByRole("button", { name: c.image.close }).click();
  await expect(sheet).toHaveCount(0);

  // The attach button opens the attach sheet; its picture row, the picker.
  await page
    .getByRole("button", { name: c.conversation.attach, exact: true })
    .filter({ visible: true })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("dialog", { name: c.attach.title })
    .getByRole("button", { name: new RegExp(`^${c.attach.photo}`) })
    .click();
  await (await chooser).setFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await cameraPhoto(page),
  });
  const chosen = page
    .getByRole("img", { name: c.image.chosen })
    .filter({ visible: true });
  await expect(chosen).toBeVisible();
  await expectCleanPage(page);
  const send = page
    .getByRole("button", { name: c.conversation.send, exact: true })
    .filter({ visible: true });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(log.getByRole("img", { name: c.image.altOwn })).toBeVisible();
  await expect(chosen).toHaveCount(0);

  await page.goto("/design/chat/desserts");
  await expect(
    log.getByText(c.message.fileGone, { exact: true }),
  ).toBeVisible();
});

// PDFs in the chat demo (C5): Omer's menu in the kitchen is a download; one
// picked from the attach sheet is checked for its name and size, shows over
// the field, goes up with its bar and becomes a download of the file picked;
// one too big is said over the field and goes nowhere; one part of the way up
// stops, and its words come back; one that didn't go tries again.
test("the chat demo sends a PDF from the attach sheet, stops one on its way, and tries one again", async ({
  page,
}) => {
  const c = he.app.chat;
  const log = page
    .getByRole("log", { name: c.conversation.log })
    .filter({ visible: true });
  const visibleButton = (name: string | RegExp) =>
    page
      .getByRole("button", {
        name,
        exact: typeof name === "string" ? true : undefined,
      })
      .filter({ visible: true });
  const pdfRow = () =>
    page
      .getByRole("dialog", { name: c.attach.title })
      .getByRole("button", { name: new RegExp(`^${c.attach.pdf}`) });

  await page.goto("/design/chat/kitchen");
  // Written without its ".pdf" (the line under it says PDF); saved with it.
  const menu = log.getByRole("link", { name: /תפריט סתיו 2026/ });
  await expect(menu).toBeVisible();
  expect(await menu.getAttribute("href")).toMatch(/^data:application\/pdf;/);
  expect(await menu.getAttribute("download")).toBe("תפריט סתיו 2026.pdf");

  // Too big: said over the field, and nothing is chosen.
  await visibleButton(c.conversation.attach).click();
  let chooser = page.waitForEvent("filechooser");
  await pdfRow().click();
  await (await chooser).setFiles({
    name: "big.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x20),
  });
  await expect(
    page
      .getByText(c.pdfFailure.tooBig.replace("<ltr>{max}</ltr>", "10"))
      .filter({ visible: true }),
  ).toBeVisible();

  // A PDF goes with the next message, up a bit at a time, then downloads.
  await visibleButton(c.conversation.attach).click();
  chooser = page.waitForEvent("filechooser");
  await pdfRow().click();
  await (await chooser).setFiles({
    name: "הזמנה.pdf",
    mimeType: "application/pdf",
    buffer: minimalPdf("ConceptApp design"),
  });
  await expect(visibleButton(c.pdf.remove)).toBeVisible();
  await expectCleanPage(page);
  await visibleButton(c.conversation.send).click();
  await expect(
    log.getByRole("progressbar", { name: c.pdf.progress }),
  ).toBeVisible();
  const sent = log.getByRole("link", { name: /הזמנה/ });
  await expect(sent).toBeVisible({ timeout: 10_000 });
  expect(await sent.getAttribute("href")).toMatch(/^blob:/);
  await expect(visibleButton(c.pdf.remove)).toHaveCount(0);

  // Part of the way up: its bar says how far; stopped, it goes, and says so.
  await page.goto("/design/chat/kitchen?state=uploading");
  const bar = log.getByRole("progressbar", { name: c.pdf.progress });
  await expect(bar).toHaveAttribute("aria-valuenow", "45");
  await log.getByRole("button", { name: c.pdf.cancel }).click();
  await expect(bar).toHaveCount(0);
  await expect(
    page.getByText(c.pdfFailure.cancelled).filter({ visible: true }),
  ).toBeVisible();

  // One that didn't go says so over the field, and goes when tried again.
  await page.goto("/design/chat/kitchen?state=pdfFailed");
  await expect(
    page.getByText(c.pdfFailure.failed).filter({ visible: true }),
  ).toBeVisible();
  await log.getByRole("button", { name: c.conversation.failed }).click();
  await expect(log.getByRole("link", { name: /הזמנה לספק/ })).toBeVisible({
    timeout: 10_000,
  });

  // One her own PDFs of the last minutes kept back says so in its own words,
  // keeps its retry, and goes when tried again.
  await page.goto("/design/chat/kitchen?state=pdfOwn");
  await expect(
    page.getByText(c.pdfFailure.busyOwn).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText(c.pdfFailure.busy).filter({ visible: true }),
  ).toHaveCount(0);
  await log.getByRole("button", { name: c.conversation.failed }).click();
  await expect(log.getByRole("link", { name: /הזמנה לספק/ })).toBeVisible({
    timeout: 10_000,
  });
});

// A sender whose switch for sending documents is off (the roles plan's R8):
// what she sent stays under "שלחת", and a line says who sends now instead of
// the way to send one.
test("the documents demo keeps what a manager sent once she no longer sends", async ({
  page,
}) => {
  const d = he.app.chat.documents;
  await page.goto("/design/chat/documents?as=manager&state=noSend");
  await expect(
    page.getByRole("heading", { name: d.sent.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(d.sent.noSend)).toBeVisible();
  await expect(
    page.getByRole("link", { name: d.sendToPeople, exact: true }),
  ).toHaveCount(0);
});

// Bigger teams, on the twins: the space for documents full, told once above
// whichever shape the width shows, and on the send screen above the way's
// switch whichever way is chosen; "כל הצוות" of 1,203 more than one document
// takes, said in the count and, once pressed, in an alert, with nothing sent;
// and chat's settings saying how full both spaces are, and whom to ask.
test("the twins say when a document can't reach everyone and when space runs out", async ({
  page,
}) => {
  const d = he.app.chat.documents;
  await page.goto("/design/chat/documents?space=full");
  await expect(
    page
      .getByRole("heading", { name: d.space.full.title })
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expectCleanPage(page);

  // A sender's own document to the business takes from the same space, so
  // the card stays when the way changes, and the switch doesn't move.
  await page.goto("/design/chat/documents/send?to=people&space=full");
  await page.waitForLoadState("networkidle");
  const full = page.getByRole("heading", { name: d.space.full.title });
  const way = page.getByRole("group", { name: d.send.way });
  await expect(full).toBeVisible();
  const toBusiness = way.getByRole("button", {
    name: d.send.toBusiness,
    exact: true,
  });
  await toBusiness.click();
  await expect(toBusiness).toHaveAttribute("aria-pressed", "true");
  await expect(full).toBeVisible();
  const card = await full.boundingBox();
  const ways = await way.boundingBox();
  expect(card?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(ways?.y ?? 0);
  await expectCleanPage(page);

  const path = "/design/chat/documents/send?to=people&state=tooMany";
  await page.goto(path);
  await expect(
    page
      .getByRole("status")
      .filter({
        hasText: heT("app.chat.documents.send.tooMany", {
          count: 1203,
          max: 1000,
        }),
      })
      .filter({ hasText: d.send.tooManyDepartments })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  // A file first, so the count is what stops it.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: d.send.pdf }).click();
  await (await chooser).setFiles({
    name: "נוהל.pdf",
    mimeType: "application/pdf",
    buffer: minimalPdf("ConceptApp bigger teams"),
  });
  await page.getByRole("button", { name: d.send.submitPeople }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: heT("app.chat.documents.send.needsFewer", { max: 1000 }),
    }),
  ).toBeVisible();
  // The stand-in was never asked: no demo's answer, and still here.
  await expect(page.getByText(d.failure.demo)).toHaveCount(0);
  await expect(page).toHaveURL(/\/send\?to=people&state=tooMany$/);
  await expectCleanPage(page);

  const f = he.app.manage.fileSpace;
  await page.goto("/design/shell/manage/chat?space=near");
  await expect(page.getByText(f.documents, { exact: true })).toBeVisible();
  await expect(page.getByText(f.chat, { exact: true })).toBeVisible();
  await expect(page.getByText(f.documentsNear)).toBeVisible();
  await expect(page.getByText(f.more)).toBeVisible();
  await expectCleanPage(page);
});

// The documents' mock screens (chat C7): the office's three shapes, one thing
// at a time on a phone ("מחכה לך" or everyone by person), the people beside
// the chosen one's documents on a tablet, and the table with its filters and
// a preview on a desktop, which opens only the row chosen. Its notice to keep
// a copy goes once "הבנתי" is pressed.
test("the documents demo shows the office's documents in each device's shape", async ({
  page,
}, testInfo) => {
  const d = he.app.chat.documents;
  const project = testInfo.project.name;
  await page.goto("/design/chat/documents");
  await expect(
    page.getByRole("heading", { level: 1, name: d.title }),
  ).toBeVisible();
  const segments = page
    .getByRole("group", { name: d.office.segments })
    .filter({ visible: true });
  const table = page
    .getByRole("table", { name: d.office.table.caption })
    .filter({ visible: true });
  await expect(segments).toHaveCount(project === "phone" ? 1 : 0);
  await expect(table).toHaveCount(project === "desktop" ? 1 : 0);
  if (project === "phone") {
    await segments.getByRole("button", { name: d.office.all }).click();
    await expect(
      page
        .getByRole("link", { name: /^נועה כהן/ })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  } else if (project === "tablet") {
    await page
      .getByRole("link", { name: /^נועה כהן/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\?person=noa$/);
    await expect(
      page
        .getByRole("heading", {
          name: d.office.personTitle.replace("{name}", "נועה כהן"),
        })
        .filter({ visible: true }),
    ).toBeVisible();
  } else {
    // Nothing opens until a row is chosen; then its preview shows the photo.
    await expect(
      page.locator('img[src$="/demo-documents/sick-note.webp"]'),
    ).toHaveCount(0);
    // The row's button starts with the person it shows, then the document
    // and which way it went.
    await table
      .getByRole("button", {
        name: heT("app.chat.documents.office.table.rowLabel", {
          person: "נועה כהן",
          title: "אישור מחלה ליום שני",
          direction: d.office.directions.from_person,
        }),
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("complementary", { name: d.office.preview.title })
        .getByRole("img"),
    ).toBeVisible();
  }
  const notice = page.getByRole("heading", { name: d.notice.title });
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: d.notice.ok }).click();
  await expect(notice).toHaveCount(0);
});

// A document's file deleted with a reason from the list, and put back from
// the toast: the row stays, saying why its file went.
test("the documents demo deletes a file with a reason, and the toast puts it back", async ({
  page,
}) => {
  const d = he.app.chat.documents;
  await page.goto("/design/chat/documents/sick-note");
  await page.getByRole("button", { name: d.removeFile }).click();
  const sheet = page.getByRole("dialog", { name: d.page.removeTitle });
  await sheet.getByRole("radio", { name: d.reasons.duplicate }).check();
  await sheet.getByRole("button", { name: d.removeFile }).click();
  const removed = d.removed.replace("{reason}", d.reasons.duplicate);
  await expect(page.getByRole("main").getByText(removed).first()).toBeVisible();
  await page
    .getByRole("status")
    .filter({ hasText: d.page.removedToast })
    .getByRole("button", { name: d.page.undo })
    .click();
  await expect(page.getByRole("main").getByText(removed)).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("img", { name: /אישור מחלה ליום שני/ }),
  ).toBeVisible();
});

// Noa's payslip asks for her "קראתי ואישרתי", the page's main action: once
// pressed, the page says she confirmed.
test("the documents demo confirms a document that asks for it", async ({
  page,
}) => {
  const d = he.app.chat.documents;
  await page.goto("/design/chat/documents/payslip?as=staff");
  await page.getByRole("button", { name: d.confirm }).click();
  await expect(
    page.getByRole("status").filter({ hasText: d.confirmedNow }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: d.confirm })).toHaveCount(0);
});

// Who sees pay from the console (its twin): the business's people lead there,
// the screen goes back to the business by its name, and a team role that only
// reads businesses sees the switches and can't change them, told why in the
// console's own words. A business nobody has joined yet says nobody sees pay,
// and that whoever joins shows up.
test("the console's twin leads to who sees pay, and back to the business", async ({
  page,
}) => {
  const a = he.app.manage.access;
  const addMenu = page.getByRole("button", {
    name: `${heT("app.manage.access.personal.addLabel", { add: a.personal.add })}: ${a.personal.choose}`,
  });
  const removeNoa = page.getByRole("button", {
    name: heT("app.manage.access.personal.removeLabel", {
      remove: a.personal.remove,
      name: "נועה כהן",
    }),
  });
  const shiran = page.getByRole("menuitemradio", { name: /שירן אלון/ });
  await page.goto("/design/console/businesses/demo-restaurant");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${a.title}`) })
    .click();
  await expect(page).toHaveURL(
    /\/design\/console\/businesses\/demo-restaurant\/access$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: a.title }),
  ).toBeVisible();
  const managers = page.getByRole("switch", { name: a.roles.manager });
  await expect(managers).toBeEnabled();
  await expect(managers).toHaveAttribute("aria-checked", "false");
  // Noa sees pay on her own; Shiran, a manager, can be added.
  await expect(removeNoa).toBeEnabled();
  await addMenu.click();
  await expect(shiran).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shiran).toHaveCount(0);
  await expect(page.getByText(he.admin.access.failure.viewOnly)).toHaveCount(0);

  await page.goto(
    "/design/console/businesses/demo-restaurant/access?state=readOnly",
  );
  await expect(page.getByText(he.admin.access.failure.viewOnly)).toBeVisible();
  await expect(page.getByText(a.failure.viewOnly)).toHaveCount(0);
  await expect(managers).toBeDisabled();
  await expect(removeNoa).toBeDisabled();
  await expect(addMenu).toHaveCount(0);
  await page.getByRole("link", { name: "מסעדת הדגמה", exact: true }).click();
  await expect(page).toHaveURL(
    /\/design\/console\/businesses\/demo-restaurant$/,
  );

  // Nobody in the business yet: nobody sees pay, and nobody is offered.
  await page.goto("/design/console/businesses/bar-hayam/access");
  await expect(
    page.getByText(heT("app.manage.access.count", { count: 0 })),
  ).toBeVisible();
  await expect(page.getByText(a.personal.noStaff)).toBeVisible();
  await expect(page.getByText(a.personal.nobody)).toHaveCount(0);
  await expect(page.getByText(he.admin.access.nobody)).toHaveCount(0);
  await expect(addMenu).toHaveCount(0);
});

// Roles and permissions, the owner's screen's twin (roles plan R0; Orel's
// answers of 15 November 2026): raising workers' lists to edit turns sending
// lists on with it and offers its undo, which puts both back, and a role
// added from the sheet joins the roles. A phone opens the role on a screen of
// its own and goes back to the list; a tablet has the role beside the list,
// and a computer every role in one table. Nothing is stored.
test("the roles demo raises workers' lists with sending, undoes it, and adds a role", async ({
  page,
}, testInfo) => {
  const r = he.app.manage.roles;
  const worker = he.app.team.roles.worker;
  const lists = he.modules.lists.name;
  const phone = testInfo.project.name === "phone";
  const desktop = testInfo.project.name === "desktop";
  const main = page.getByRole("main");
  const title = (name: string) =>
    page.getByRole("heading", { level: 1, name }).filter({ visible: true });

  await page.goto("/design/shell/manage/roles");
  await expect(title(r.title)).toBeVisible();
  if (!desktop) {
    await main
      .getByRole("button", { name: new RegExp(`^${worker}`) })
      .filter({ visible: true })
      .click();
  }
  if (phone) {
    await expect(title(worker)).toBeVisible();
    // A step in the history, so the phone's own back leads to the roles.
    await expect(page).toHaveURL(/[?&]role=worker\b/);
    await expectCleanPage(page);
  }

  const edit = main
    .getByRole("switch", {
      name: heT("app.manage.roles.editLabel", { area: lists, role: worker }),
    })
    .filter({ visible: true });
  const send = main
    .getByRole("switch", {
      name: heT("app.manage.roles.extraLabel", {
        extra: r.extras.lists.send.label,
        role: worker,
      }),
    })
    .filter({ visible: true });
  await expect(edit).toHaveAttribute("aria-checked", "false");
  await expect(send).toHaveAttribute("aria-checked", "false");
  await expect(send).toBeDisabled();

  await edit.click();
  await expect(edit).toHaveAttribute("aria-checked", "true");
  await expect(send).toHaveAttribute("aria-checked", "true");
  await expect(send).toBeEnabled();
  const raised = main.getByRole("status").filter({
    hasText: heT("app.manage.roles.done.editWith", {
      role: worker,
      area: lists,
      extras: r.extras.lists.send.phrase,
    }),
  });
  // By the keyboard: as the toast's button goes, the focus goes back to the
  // switch that was changed.
  await raised.getByRole("button", { name: he.app.manage.undo }).press("Enter");
  await expect(edit).toHaveAttribute("aria-checked", "false");
  await expect(edit).toBeFocused();
  await expect(send).toHaveAttribute("aria-checked", "false");
  await expect(send).toBeDisabled();
  await expect(
    main.getByRole("status").filter({ hasText: r.done.undone }),
  ).toBeVisible();

  if (phone) {
    // The screen's own way back, then the phone's forward and back.
    await main.getByRole("button", { name: r.title }).click();
    await expect(title(r.title)).toBeVisible();
    await page.goForward();
    await expect(title(worker)).toBeVisible();
    await page.goBack();
    await expect(title(r.title)).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]role=/);
  }
  await main
    .getByRole("button", { name: r.add })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: r.addSheet.name }).fill("אחראי בר");
  await sheet.getByRole("button", { name: r.addSheet.submit }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    main.getByRole("status").filter({
      hasText: heT("app.manage.roles.done.added", { name: "אחראי בר" }),
    }),
  ).toBeVisible();
  await expect(
    desktop
      ? main
          .getByRole("columnheader", { name: /^אחראי בר/ })
          .filter({ visible: true })
      : main
          .getByRole("button", { name: /^אחראי בר/ })
          .filter({ visible: true }),
  ).toBeVisible();
  await expectCleanPage(page);
});

// The roles plan's R10 (Orel, 16 November 2026): the shift lead, built on
// workers, differs from them in scheduling, lists and the team, each marked
// "שונה", and "חזרה להתחלה" puts all three back as workers are, with one
// toast whose undo brings them back. Nothing is stored.
test("the roles demo marks what differs from where a role started and puts it back", async ({
  page,
}) => {
  const r = he.app.manage.roles;
  const main = page.getByRole("main");
  await page.goto("/design/shell/manage/roles?role=shift-lead");
  const marks = main
    .getByText(r.changed, { exact: true })
    .filter({ visible: true });
  const reset = main
    .getByRole("button", { name: new RegExp(`^${r.reset.action}`) })
    .filter({ visible: true });
  await expect(marks).toHaveCount(3);
  await expect(reset).toHaveCount(1);
  await expect(
    main
      .getByText(
        heT("app.manage.roles.reset.hintNamed", {
          base: he.app.team.roles.worker,
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expectCleanPage(page);

  await reset.click();
  const back = main.getByRole("status").filter({
    hasText: heT("app.manage.roles.done.reset", { role: "אחראי משמרת" }),
  });
  await expect(back).toBeVisible();
  await expect(marks).toHaveCount(0);
  await expect(reset).toHaveCount(0);
  await back.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(marks).toHaveCount(3);
});

// The inbox's twin has pay access the ConceptApp team gave from the console:
// its line says so, and on a computer the "who" cell is the team itself (the
// line's note names the team too, so the cell alone is checked).
test("the inbox twin says the ConceptApp team gave pay access", async ({
  page,
}, testInfo) => {
  const n = he.app.notifications;
  const byTeam = n.kinds.access.pay_granted.byTeam;
  await page.goto("/design/shell/notifications");
  await expect(
    page.getByText(byTeam).filter({ visible: true }).first(),
  ).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(
      page.getByRole("row").filter({ hasText: byTeam }).getByRole("rowheader"),
    ).toHaveText(n.who.team);
  }
});

/** Text to find as it is, inside a pattern. */
const asIs = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Goes to another screen of a demo through the tab bar, as a thumb would.
 * A long screen scrolled down shrinks the phone's bar to its current tab:
 * at the top it is full size again, each tab one tap away.
 */
async function throughTabBar(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator("nav[data-tab-compact]")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true })
    // The name, and a count after it when the tab has one ("..., 2").
    .getByRole("link", { name: new RegExp(`^${asIs(name)}(\\s*,|$)`) })
    .click();
}

/** The twin's restaurant's words: the app's, with its template's sentences. */
const rt = createTranslator({
  locale: "he",
  messages: mergeWording(he as MessageTree, restaurantWording) as typeof he,
}) as typeof heT;

/**
 * The "ביטול" of the mode's toast that says `text`: the twin runs orders, so
 * its order screen has "ביטול ההזמנה" too, a button whose name holds the word.
 */
const orderUndo = (page: Page, text: string) =>
  page
    .getByRole("status")
    .filter({ hasText: text })
    .getByRole("button", { name: rt("app.orders.toast.undo"), exact: true });

// Waiter mode P8b's lines, in the restaurant's words: a ready order and a
// screen not connected, from Noa and from the app on a computer, and the
// screen not connected leading into the order twin, which says so too.
test("the inbox twin says an order is ready and a kitchen screen isn't connected", async ({
  page,
}, testInfo) => {
  const order = he.app.notifications.kinds.order;
  const kitchen = "מטבח";
  const ready = rt("app.notifications.kinds.order.ready.title", {
    place: rt("app.orders.place.numbered", { name: "11" }),
    department: kitchen,
  });
  const unseen = rt("app.notifications.kinds.order.unseen.title", {
    place: rt("app.orders.place.numbered", { name: "4" }),
    department: kitchen,
  });
  await page.goto("/design/shell/notifications/orders");
  await expect(
    page.getByText(ready).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(order.unseen.body).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(order.ready.settledNote).filter({ visible: true }).first(),
  ).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(
      page.getByRole("row").filter({ hasText: ready }).getByRole("rowheader"),
    ).toHaveText(/נועה/);
    await expect(
      page.getByRole("row").filter({ hasText: unseen }).getByRole("rowheader"),
    ).toHaveText(he.app.notifications.who.app);
  }
  await page
    .getByRole("link", { name: new RegExp(asIs(unseen)) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/design\/order-taking\/floor\/order\?place=table-4/,
  );
  await expect(
    page
      .getByText(
        rt("app.orders.ticketState.screenOff", { department: kitchen }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// Waiter mode's twin (S0, #191) as a waiter times it on a phone: a free
// table opens on its items, two taps add two, one sends them, and the
// kitchen's part is on the prep screen. Marked ready there, it comes back
// ready on the floor, is served from the order with its undo, and the
// order's list for the till has both items and no total. One page, so the
// store in memory carries it all.
test("the waiter mode demo sends to the prep screen and comes back ready", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the walk is timed on a phone");
  const shown = (locator: Locator) => locator.filter({ visible: true });
  // Since P4 the mode's screens are the app's, in the restaurant's words.
  const table6 = rt("app.orders.place.numbered", { name: "6" });
  // The tile shows "שולחן" small above its large "6": its name starts so.
  const tile6 = new RegExp(`^${rt("app.orders.place.kind")}\\s*6(?!\\d)`);
  const kitchen = "מטבח";

  await page.goto("/design/order-taking/floor");
  await expect(
    page.getByRole("heading", { level: 1, name: rt("app.orders.floor.title") }),
  ).toBeVisible();
  await shown(page.getByRole("link", { name: tile6 })).click();
  await expect(page).toHaveURL(/place=table-6$/);
  await expect(
    page.getByRole("heading", { level: 1, name: table6 }),
  ).toBeVisible();

  await shown(page.getByRole("button", { name: /^לימונדה/ }))
    .first()
    .click();
  await shown(page.getByRole("button", { name: /^פוקאצ'ה/ }))
    .first()
    .click();
  const send = shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.send.label")}`),
    }),
  );
  await expect(send).toHaveCount(1);
  await send.click();
  await expect(
    page.getByText(rt("app.orders.toast.sent", { place: table6 })),
  ).toBeVisible();
  // The round is on the order now, its kitchen part not yet on a screen.
  await expect(
    shown(page.getByRole("heading", { level: 3 })).filter({
      hasText: /^סבב 1/,
    }),
  ).toBeVisible();
  await expect(
    shown(page.getByText(rt("app.orders.ticketState.sent"), { exact: true })),
  ).toHaveCount(2);

  await throughTabBar(page, rt("modules.order_taking.mode.prep"));
  await expect(page).toHaveURL(/\/design\/order-taking\/prep$/);
  const ticket = page.getByRole("article", {
    name: rt("app.orders.prep.label", { place: table6, department: kitchen }),
  });
  await expect(ticket).toBeVisible();
  await expect(ticket.getByText(/פוקאצ'ה/)).toBeVisible();
  await ticket
    .getByRole("button", { name: rt("app.orders.prep.ready") })
    .click();
  await expect(
    page.getByText(
      rt("app.orders.toast.ready", { place: table6, department: kitchen }),
    ),
  ).toBeVisible();
  await expect(ticket).toHaveCount(0);

  // Table 6's ticket is the newest, far down the list: the page scrolled to
  // it, and the bar shrank.
  await throughTabBar(page, rt("modules.order_taking.mode.places"));
  const tile = shown(page.getByRole("link", { name: tile6 }));
  await expect(tile).toContainText(rt("app.orders.floor.state.ready"));
  await tile.click();
  // The phone's switch between the items and the order: a Segmented, whose
  // options are buttons with aria-pressed.
  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.order.view.order")}`),
    }),
  )
    .first()
    .click();
  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.order.serve")}.*${kitchen}`),
    }),
  ).click();
  const served = rt("app.orders.toast.served", {
    place: table6,
    department: kitchen,
  });
  await expect(page.getByText(served)).toBeVisible();
  await orderUndo(page, served).click();
  await expect(page.getByText(served)).toHaveCount(0);

  await shown(
    page.getByRole("link", { name: rt("app.orders.rounds.till") }),
  ).click();
  await expect(page).toHaveURL(/\/floor\/till\?order=/);
  // The app's own till since P5, in the restaurant's words.
  await expect(shown(page.getByText(rt("app.orders.till.note")))).toBeVisible();
  const list = shown(
    page.getByRole("list", { name: rt("app.orders.till.byItem") }),
  );
  await expect(list.getByText("לימונדה")).toBeVisible();
  await expect(list.getByText("פוקאצ'ה")).toBeVisible();
  await expectCleanPage(page);
});

// A burger has a doneness to choose (P6): its row opens its choices,
// "הוספה" waits for one, the draft reads them with the price they make, and
// the kitchen's ticket reads them under the burger. One page, so the store
// in memory carries it all.
test("the waiter mode demo adds a burger through its choices", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the walk is timed on a phone");
  const shown = (locator: Locator) => locator.filter({ visible: true });
  const table6 = rt("app.orders.place.numbered", { name: "6" });

  await page.goto(
    "/design/order-taking/floor/order?place=table-6&state=service",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: table6 }),
  ).toBeVisible();
  const burger = shown(page.getByRole("button", { name: /^המבורגר/ })).first();
  await expect(burger).toContainText(rt("app.orders.picker.needsChoice"));
  await burger.click();
  const sheet = page.getByRole("dialog", { name: "המבורגר" });
  const add = sheet.getByRole("button", {
    name: rt("app.orders.choice.add", { count: 1 }),
    exact: true,
  });
  await expect(add).toBeDisabled();
  await sheet.getByRole("radio", { name: "מדיום", exact: true }).check();
  const cheese = sheet.getByRole("switch", { name: "גבינה", exact: true });
  await cheese.click();
  await expect(sheet).toContainText("74.00");
  // What an extra adds is read with its switch, as with a radio.
  await expect(cheese).toHaveAccessibleDescription(/6\.00/);
  // Both extras on: there is no other to choose, so nothing says to take
  // one off. Off again, the burger is as it was.
  const egg = sheet.getByRole("switch", { name: "ביצה", exact: true });
  await egg.click();
  await expect(egg).toHaveAttribute("aria-checked", "true");
  await expect(sheet).toContainText("80.00");
  await expect(
    sheet.getByText(rt("app.orders.choice.full", { max: 2 })),
  ).toHaveCount(0);
  await egg.click();
  await expect(egg).toHaveAttribute("aria-checked", "false");
  await expect(sheet).toContainText("74.00");
  await expect(add).toBeEnabled();
  await add.click();
  await expect(sheet).toHaveCount(0);

  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.order.view.order")}`),
    }),
  )
    .first()
    .click();
  await expect(shown(page.getByText("מדיום · גבינה")).first()).toBeVisible();
  await expect(shown(page.getByText("74.00")).first()).toBeVisible();
  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${rt("app.orders.send.label")}`),
    }),
  ).click();
  await expect(
    page.getByText(rt("app.orders.toast.sent", { place: table6 })),
  ).toBeVisible();

  await throughTabBar(page, rt("modules.order_taking.mode.prep"));
  const ticket = page.getByRole("article", {
    name: rt("app.orders.prep.label", { place: table6, department: "מטבח" }),
  });
  await expect(ticket.getByText("מדיום · גבינה")).toBeVisible();
  await expectCleanPage(page);
});

// The menu's twin gives the pasta a group of choices (P6), and on the
// floor its row opens them.
test("the waiter mode demo's menu gives an item a group of choices", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one run is enough");
  const shown = (locator: Locator) => locator.filter({ visible: true });
  const m = he.app.orders.menu;
  await page.goto("/design/order-taking/menu?state=service");
  await shown(page.getByRole("button", { name: /^פסטה/ }))
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: m.groups.add }).click();
  const groupName = sheet.getByLabel(m.group.name, { exact: true });
  await groupName.fill("רוטב");
  const option = (n: number) =>
    sheet.getByLabel(rt("app.orders.menu.group.option", { n }), {
      exact: true,
    });

  // With no option, the save focuses "הוספת אפשרות", and the problem is
  // read with it.
  await sheet
    .getByRole("button", {
      name: rt("app.orders.menu.group.removeOption", {
        name: rt("app.orders.menu.group.option", { n: 1 }),
      }),
    })
    .click();
  const addOption = sheet.getByRole("button", { name: m.group.addOption });
  await sheet.getByRole("button", { name: m.sheet.save }).click();
  await expect(addOption).toBeFocused();
  await expect(addOption).toHaveAccessibleDescription(m.group.empty);
  await addOption.click();
  await expect(option(1)).toBeFocused();
  await option(1).fill("עגבניות");
  await addOption.click();
  await option(2).fill("שמנת");
  await addOption.click();
  await option(3).fill("פסטו");

  // "עד כמה בוחרים" cleared and typed again takes what is typed.
  const most = sheet.getByLabel(m.group.most, { exact: true });
  await most.fill("");
  await expect(most).toHaveValue("");
  await most.pressSequentially("2");
  await expect(most).toHaveValue("2");
  await expect(
    sheet.getByText(
      rt("app.orders.menu.sheet.rule.between", { min: 1, max: 2 }),
    ),
  ).toBeVisible();
  await sheet
    .getByRole("button", {
      name: rt("app.orders.menu.group.less", { name: "רוטב" }),
    })
    .click();
  await expect(most).toHaveValue("1");

  // Removed, its way back names it, and says it goes with the save.
  await sheet.getByRole("button", { name: m.group.remove }).click();
  const restore = sheet.getByRole("button", {
    name: new RegExp(`^${m.group.restore}.*רוטב`),
  });
  await expect(restore).toBeFocused();
  await expect(restore).toHaveAccessibleDescription(
    rt("app.orders.menu.group.removed", { name: "רוטב" }),
  );
  await restore.click();
  await expect(groupName).toBeFocused();
  await expectCleanPage(page, "", true);
  await sheet.getByRole("button", { name: m.sheet.save }).click();
  await expect(sheet).toHaveCount(0);
  // Its row counts it.
  await expect(
    shown(page.getByRole("button", { name: /^פסטה/ })).first(),
  ).toContainText(rt("app.orders.menu.choices", { count: 1 }));

  await throughTabBar(page, rt("modules.order_taking.mode.places"));
  await shown(
    page.getByRole("link", {
      name: new RegExp(`^${rt("app.orders.place.kind")}\\s*6(?!\\d)`),
    }),
  ).click();
  await shown(page.getByRole("button", { name: /^פסטה/ }))
    .first()
    .click();
  const choices = page.getByRole("dialog", { name: "פסטה" });
  await expect(choices.getByText("רוטב", { exact: true })).toBeVisible();
  await expect(
    choices.getByText(rt("app.orders.choice.rule.one")),
  ).toBeVisible();
});

// A ticket of Shiran's turns ready while she looks at the floor: the mode's
// one toast says so, and its "פתיחה" leads to the order (P4).
test("the waiter mode demo says what turned ready, and opens it", async ({
  page,
}) => {
  await page.goto("/design/order-taking/floor?state=readyNow");
  const ready = rt("app.orders.toast.ready", {
    place: rt("app.orders.place.numbered", { name: "4" }),
    department: "מטבח",
  });
  await expect(page.getByText(ready)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: rt("app.orders.toast.open") }).click();
  await expect(page).toHaveURL(/floor\/order\?order=order-4$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: rt("app.orders.place.numbered", { name: "4" }),
    }),
  ).toBeVisible();
});

// The fish ran out after it was chosen: the send says so by its name, and
// the draft stays as it was, to take it off and send again (P4).
test("the waiter mode demo refuses a dish sold out meanwhile and keeps the draft", async ({
  page,
}, testInfo) => {
  await page.goto(
    "/design/order-taking/floor/order?place=table-6&state=soldOut",
  );
  if (testInfo.project.name === "phone") {
    await page
      .getByRole("button", {
        name: new RegExp(`^${rt("app.orders.order.view.order")}`),
      })
      .filter({ visible: true })
      .first()
      .click();
  }
  await page
    .getByRole("button", {
      name: new RegExp(`^${rt("app.orders.send.label")}`),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({
        hasText: rt("app.orders.failed.unavailable", { items: "דג היום" }),
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: rt("app.orders.draft.title") })
      .filter({ visible: true }),
  ).toBeVisible();
});

// Off a shift, the floor waits and leads to the clock (P4).
test("the waiter mode demo offers the clock off a shift", async ({ page }) => {
  await page.goto("/design/order-taking/floor?state=offClock");
  await expect(
    page.getByRole("heading", { name: rt("app.orders.offClock.title") }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: rt("app.orders.offClock.action") }),
  ).toHaveAttribute("href", "/design/shell/clock");
});

// The twin's list of screens opens each one afresh in the state its row
// names, whatever the last row left: the store above the screens lives on
// between them, and only a link with a state starts it again.
test("the waiter mode demo's list opens each row in its own state", async ({
  page,
}) => {
  const o = he.design.orderTaking;
  // A row is the link whose title reads exactly so: "השולחנות" and the
  // places' row share a start.
  const row = (title: string) =>
    page
      .getByRole("link")
      .filter({ has: page.getByText(title, { exact: true }) });
  const shownText = (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true });

  await page.goto("/design/order-taking");
  await row(o.index.screens.quiet.title).click();
  await expect(page).toHaveURL(/\/floor$/);
  await expect(shownText(o.floor.status.free)).toBeVisible();

  // Back on the list, the evening as it is: two ready to serve, not quiet.
  await page.goBack();
  await row(o.index.screens.floor.title).click();
  await expect(page).toHaveURL(/\/floor$/);
  await expect(
    page
      .getByText(heT("design.orderTaking.floor.status.ready", { count: 2 }))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(shownText(o.floor.status.free)).toHaveCount(0);

  // After a business with no menu, the menu has its items again.
  await page.goBack();
  await row(o.index.screens.noMenu.title).click();
  await expect(shownText(o.picker.noMenu.title)).toBeVisible();
  await page.goBack();
  await row(o.index.screens.menu.title).click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(shownText(o.picker.noMenu.title)).toHaveCount(0);

  // After the quiet evening, table 4's list for the till is there.
  await page.goBack();
  await row(o.index.screens.quiet.title).click();
  await expect(page).toHaveURL(/\/floor$/);
  await page.goBack();
  await row(o.index.screens.tillItem.title).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: rt("app.orders.till.title", {
        place: rt("app.orders.place.numbered", { name: "4" }),
      }),
    }),
  ).toBeVisible();
});

// The real menu screens on the twin (waiter mode P2), in the restaurant's
// words, on S0's routes and its one store: sold out with its undo, and once
// marked the floor's picker greys the item; a price changed in place on a
// computer; a new item in the category chosen for it, which the picker then
// offers; an item's choices shown as they are.

test("the waiter mode demo's menu marks sold out for the floor's picker, and adds and edits items", async ({
  page,
}, testInfo) => {
  const main = page.getByRole("main");
  const project = testInfo.project.name;
  const o = he.design.orderTaking;
  const m = he.app.orders.menu;
  const shown = (locator: Locator) => locator.filter({ visible: true });
  const toast = (text: string) =>
    page.getByRole("status").filter({ hasText: text });
  /** A category's own section: on a phone each one, on a tablet the chosen one. */
  const section = (name: string) =>
    shown(
      main.locator("section").filter({
        has: page.getByRole("heading", { name, exact: true }),
      }),
    );
  const choose = async (category: string) => {
    if (project === "tablet") {
      await shown(
        main.getByRole("button", { name: new RegExp(`^${asIs(category)}`) }),
      ).click();
    }
  };

  await page.goto("/design/order-taking/menu?state=service");
  await choose("עיקריות");
  const pasta = shown(
    main.getByRole("switch", {
      name: rt("app.orders.menu.soldOutFor", { name: "פסטה" }),
    }),
  );
  await pasta.click();
  await expect(pasta).toHaveAttribute("aria-checked", "true");
  await toast(rt("app.orders.menu.toast.soldOut", { name: "פסטה" }))
    .getByRole("button", { name: m.toast.undo })
    .click();
  await expect(pasta).toHaveAttribute("aria-checked", "false");
  // Marked again, for the floor to see.
  await pasta.click();
  await expect(pasta).toHaveAttribute("aria-checked", "true");

  if (project === "desktop") {
    // In place, on the table.
    const price = main.getByLabel(
      rt("app.orders.menu.priceFor", { name: "שניצל" }),
    );
    await price.fill("64");
    await price.press("Enter");
    await expect(
      toast(rt("app.orders.menu.toast.price", { name: "שניצל" })),
    ).toBeVisible();
    await expect(price).toHaveValue("64");
  }

  await shown(main.getByRole("button", { name: /^המבורגר/ }))
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  // Its groups of choices, edited in place since P6: the first's name in
  // its field, and its rule as it reads now.
  await expect(
    sheet.getByLabel(rt("app.orders.menu.group.name"), { exact: true }).first(),
  ).toHaveValue("מידת עשייה");
  await expect(
    sheet.getByText(rt("app.orders.menu.sheet.rule.one")),
  ).toBeVisible();
  await expectCleanPage(page, "", true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // A new item, in the category chosen for it.
  await shown(
    page.getByRole("button", { name: rt("app.orders.menu.add") }),
  ).click();
  await sheet.getByLabel(rt("app.orders.menu.sheet.name")).fill("סורבה");
  await sheet.getByLabel(m.sheet.price, { exact: true }).fill("28");
  await sheet
    .getByRole("button", { name: new RegExp(`^${asIs(m.sheet.category)}:`) })
    .click();
  await page.getByRole("menuitemradio", { name: /^קינוחים/ }).click();
  await sheet.getByRole("button", { name: m.sheet.add }).click();
  await expect(
    toast(rt("app.orders.menu.toast.added", { name: "סורבה" })),
  ).toBeVisible();
  await choose("קינוחים");
  if (project === "desktop") {
    await expect(
      main.getByRole("row").filter({ hasText: "סורבה" }),
    ).toContainText("קינוחים");
  } else {
    await expect(
      section("קינוחים").getByRole("button", { name: /^סורבה/ }),
    ).toBeVisible();
  }

  // On the floor the twin's one store has both: the pasta greyed in the
  // picker, which can't add it, and the new item there to add.
  await throughTabBar(page, o.nav.places);
  await expect(page).toHaveURL(/\/design\/order-taking\/floor$/);
  await shown(
    page.getByRole("link", {
      name: new RegExp(`^${o.place.tableWord}\\s*6(?!\\d)`),
    }),
  )
    .first()
    .click();
  await expect(page).toHaveURL(/place=table-6$/);
  const search = page.getByLabel(o.picker.search);
  const found = page.getByRole("list", { name: o.picker.found });
  await search.fill("פסטה");
  const pastaRow = found.getByRole("button", { name: /^פסטה/ });
  await expect(pastaRow).toBeDisabled();
  await expect(pastaRow).toContainText(o.picker.soldOut);
  await search.fill("סורבה");
  await expect(found.getByRole("button", { name: /^סורבה/ })).toBeEnabled();
});

// The real import screen on the twin: a line a PDF turned around turned
// back; lines to fix hold the import and say how many; and a café's paste
// added with each new category's department chosen, which the menu and the
// categories then show.
test("the waiter mode demo's paste turns lines back, holds what needs fixing, and adds each category where it is prepared", async ({
  page,
}) => {
  const main = page.getByRole("main");
  const i = he.app.orders.import;
  const shownText = (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true });
  // The import's button, whatever it counts.
  const anyImport = new RegExp(
    asIs(rt("app.orders.import.action", { count: 7 })).replace("7", "\\d+"),
  );

  await page.goto("/design/order-taking/menu/import?state=reversed");
  const paste = page.getByLabel(i.paste);
  await expect(shownText(i.problem.reversed)).toBeVisible();
  await expect(page.getByRole("button", { name: anyImport })).toHaveCount(0);
  await page.getByRole("button", { name: i.unreverse }).click();
  await expect(paste).toHaveValue(/15 שוקו חם/);
  await expect(shownText(i.problem.reversed)).toHaveCount(0);
  await expect(page.getByRole("button", { name: anyImport })).toHaveCount(1);

  await page.goto("/design/order-taking/menu/import?state=problems");
  await expect(
    shownText(rt("app.orders.import.blocked", { count: 2 })),
  ).toBeVisible();
  await expect(shownText(i.problem.noPrice)).toBeVisible();
  await expect(page.getByRole("button", { name: anyImport })).toHaveCount(0);

  await page.goto("/design/order-taking/menu/import?state=service");
  await page
    .getByRole("button", {
      name: new RegExp(
        `^${asIs(heT("app.orders.import.department", { category: "ארוחות בוקר" }))}`,
      ),
    })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: /^בר/ }).click();
  await page
    .getByRole("button", { name: rt("app.orders.import.action", { count: 5 }) })
    .click();
  await expect(
    page.getByText(rt("app.orders.import.done", { items: 5, categories: 2 })),
  ).toBeVisible();
  // The done card's way on: the app's words, apart from the back link's.
  await main.getByRole("link", { name: i.toMenu, exact: true }).click();
  await expect(page).toHaveURL(/\/design\/order-taking\/menu$/);
  await expect(
    page.getByText("ארוחות בוקר").filter({ visible: true }).first(),
  ).toBeVisible();
  await main
    .getByRole("link", {
      name: new RegExp(`^${asIs(rt("app.orders.menu.categoriesRow"))}`),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/design\/order-taking\/menu\/categories$/);
  await expect(
    main.getByRole("button", {
      name: `${heT("app.orders.categories.department", { name: "ארוחות בוקר" })}: בר`,
    }),
  ).toBeVisible();
});

// The categories on the twin: on a tablet the count chooses the category
// whose items show beside the list, apart from typing its name; with no
// department yet the screen says only what it can do, and leads to the
// departments; and the departments of a business that takes orders without
// lists say what a department is for there.
test("the waiter mode demo's categories show the chosen one's items, and send a business with no department to its departments", async ({
  page,
}, testInfo) => {
  const main = page.getByRole("main");
  const c = he.app.orders.categories;
  const d = he.app.manage.departments;
  const shownText = (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true });

  await page.goto("/design/order-taking/menu/categories?state=service");
  if (testInfo.project.name === "tablet") {
    const desserts = main.getByRole("button", {
      name: new RegExp(
        `${asIs(heT("app.orders.categories.itemsWhere", { name: "קינוחים" }))}$`,
      ),
    });
    await desserts.click();
    await expect(desserts).toHaveAttribute("aria-current", "true");
    await expect(
      main.getByRole("heading", {
        name: heT("app.orders.categories.itemsOf", { name: "קינוחים" }),
      }),
    ).toBeVisible();
    await expect(shownText("עוגת שוקולד")).toBeVisible();
  }

  await page.goto("/design/order-taking/menu/categories?state=noDepartments");
  await expect(shownText(c.emptyView)).toBeVisible();
  await expect(page.getByText(c.empty, { exact: true })).toHaveCount(0);
  await expect(shownText(c.noDepartments)).toBeVisible();
  await expect(main.getByRole("link", { name: c.toDepartments })).toBeVisible();

  await page.goto("/design/shell/manage/departments?state=menuEmpty");
  await expect(shownText(d.subtitleMenu)).toBeVisible();
  await expect(shownText(d.emptyMenu)).toBeVisible();
  await expect(page.getByText(d.empty, { exact: true })).toHaveCount(0);
});

// The twin's places made at once for a business with none, and the app
// demo's departments saying what each prepares, and what goes nowhere once
// one is removed.
test("the waiter mode demo makes its tables at once, and its departments count the menu", async ({
  page,
}) => {
  await page.goto("/design/order-taking/menu/places?state=noPlaces");
  // Whatever is typed, the button names what it makes: 0 makes one, and a
  // cleared field the 10 it started with.
  const count = page.getByLabel(he.app.orders.places.quick.count);
  await count.fill("0");
  await expect(
    page.getByRole("button", {
      name: rt("app.orders.places.quick.action", { count: 1 }),
    }),
  ).toBeVisible();
  await count.fill("");
  await page
    .getByRole("button", {
      name: rt("app.orders.places.quick.action", { count: 10 }),
    })
    .click();
  await expect(
    page.getByLabel(rt("app.orders.places.nameOf", { name: "10" })),
  ).toHaveValue("10");
  await expect(
    page.getByLabel(rt("app.orders.places.nameOf", { name: "11" })),
  ).toHaveCount(0);

  await page.goto("/design/shell/manage/departments?state=menu");
  await expect(
    page
      .getByText(heT("app.manage.departments.menuItems", { count: 9 }))
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: heT("app.manage.departments.remove", { name: "מטבח" }),
    })
    .click();
  const undo = page
    .getByRole("status")
    .filter({
      hasText: heT("app.manage.departments.removedMenu", {
        name: "מטבח",
        count: 9,
      }),
    })
    .getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(
    page
      .getByText(heT("app.manage.departments.menuItems", { count: 9 }))
      .filter({ visible: true }),
  ).toBeVisible();
});

// The kitchen's screen opened offline stays offline once the state comes
// off the address: after two asks that failed, its banner across the top
// (P8a), and its quiet line says so.
test("the waiter mode demo's kitchen screen stays offline", async ({
  page,
}) => {
  const words = he.app.orders.station;
  await page.goto("/design/order-taking/station/prep?state=offline");
  await expect(page).toHaveURL(/\/station\/prep$/);
  // The page's own alert, not the router's announcer.
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    words.offline,
    { timeout: 20_000 },
  );
  // The quiet line whole: the banner's title starts with the same words.
  await expect(
    page.getByText(`${words.offlineShort} · ${words.soundOn}`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(words.online, { exact: true })).toHaveCount(0);
});

// The kitchen's screen past its button on the twin (P8a) plays its sound,
// as the button's press leaves it: its quiet line says so and no banner
// asks for a tap. Only `soundLocked` shows the sound stopped, with the
// banner that is its button, and pressing it starts the sound.
test("the waiter mode demo's kitchen screen says its sound plays, but where it stopped", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one width is enough");
  // A stand-in for the device's sound, which runs once tapped.
  await stubAudio(page);
  const words = he.app.orders.station;
  const banner = page.getByRole("button", {
    name: new RegExp(`^${words.soundLocked}`),
  });
  await page.goto("/design/order-taking/station/prep?state=open");
  await expect(page).toHaveURL(/\/station\/prep$/);
  await expect(
    page.getByText(`${words.online} · ${words.soundOn}`, { exact: true }),
  ).toBeVisible();
  await expect(banner).toHaveCount(0);

  await page.goto("/design/order-taking/station/prep?state=soundLocked");
  await expect(page).toHaveURL(/\/station\/prep$/);
  await expect(banner).toBeVisible();
  await expect(page.getByText(words.online, { exact: true })).toBeVisible();
  await banner.click();
  await expect(banner).toHaveCount(0);
  await expect(
    page.getByText(`${words.online} · ${words.soundOn}`, { exact: true }),
  ).toBeVisible();
});

// The kitchen's screen on the twin (P8a): it reads nothing until its one
// button; "מוכן" bumps a ticket with "ביטול" in the toast, then to "מוכנים
// לאחרונה", from where it goes back to be made.
test("the waiter mode demo's kitchen screen opens with its button, and bumps a ticket with its undo", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the walk is the phone's");
  const table4 = rt("app.orders.place.numbered", { name: "4" });
  const kitchen = "מטבח";
  await page.goto("/design/order-taking/station/prep?state=service");
  await expect(page).toHaveURL(/\/station\/prep$/);
  const ticket = page
    .getByRole("article", {
      name: rt("app.orders.prep.label", { place: table4, department: kitchen }),
    })
    .first();
  await expect(ticket).toHaveCount(0);
  await page
    .getByRole("button", { name: rt("app.orders.station.open") })
    .click();
  await expect(ticket).toBeVisible();
  await ticket
    .getByRole("button", { name: rt("app.orders.prep.ready") })
    .click();
  await expect(
    page.getByText(
      rt("app.orders.toast.ready", { place: table4, department: kitchen }),
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: rt("app.orders.toast.undo") }).click();
  await expect(
    ticket.getByRole("button", { name: rt("app.orders.prep.ready") }),
  ).toBeVisible();
  await ticket
    .getByRole("button", { name: rt("app.orders.prep.ready") })
    .click();
  await expect(
    page.getByRole("heading", { level: 2, name: rt("app.orders.prep.recent") }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: new RegExp(`^${rt("app.orders.prep.putBack")}`),
    })
    .first()
    .click();
  await expect(
    page.getByText(rt("app.orders.toast.putBack", { place: table4 })),
  ).toBeVisible();
});

// "מה נגמר" on the kitchen's screen (P8a): a switch marks the hummus sold
// out at once, and "ביטול" in the sheet puts it back.
test("the waiter mode demo's kitchen screen marks an item sold out, with its undo", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the walk is the phone's");
  await page.goto("/design/order-taking/station/prep?state=open");
  await page
    .getByRole("button", { name: rt("app.orders.station.soldOut.open") })
    .click();
  const sheet = page.getByRole("dialog");
  const hummus = sheet.getByRole("switch", { name: "חומוס" });
  await expect(hummus).toHaveAttribute("aria-checked", "false");
  await hummus.click();
  await expect(hummus).toHaveAttribute("aria-checked", "true");
  await expect(
    sheet.getByText(rt("app.orders.station.soldOut.done", { name: "חומוס" })),
  ).toBeVisible();
  await sheet
    .getByRole("button", { name: rt("app.orders.toast.undo") })
    .click();
  await expect(hummus).toHaveAttribute("aria-checked", "false");
});

// The till on the twin (P8a): table 9's close with "ביטול", closed again,
// and opened again from where it is.
test("the waiter mode demo's till closes a table with its undo, and opens it again", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the walk is the phone's");
  const table9 = rt("app.orders.place.numbered", { name: "9" });
  await page.goto("/design/order-taking/station/till?state=chosen");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: rt("app.orders.till.title", { place: table9 }),
    }),
  ).toBeVisible();
  const close = page.getByRole("button", {
    name: rt("app.orders.close.place"),
  });
  await close.click();
  await expect(
    page.getByText(rt("app.orders.toast.closed", { place: table9 })),
  ).toBeVisible();
  await page.getByRole("button", { name: rt("app.orders.toast.undo") }).click();
  await expect(close).toBeVisible();
  await close.click();
  await page
    .getByRole("button", { name: rt("app.orders.close.reopen") })
    .click();
  await expect(
    page.getByText(rt("app.orders.toast.reopened", { place: table9 })),
  ).toBeVisible();
  await expect(close).toBeVisible();
});

// The till's "ביטול" (P8a) stays while the cashier goes on to the next
// order, chosen beside it on a tablet: table 9's close is taken back from
// the toast once table 4 is the one shown.
test("the waiter mode demo's till keeps a close's undo while the next order is chosen", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "tablet",
    "the list beside the order is the tablet's",
  );
  const table = (name: string) => rt("app.orders.place.numbered", { name });
  const row = (name: string) =>
    page
      .getByRole("button", { name: new RegExp(`^${table(name)}`) })
      .filter({ visible: true })
      .first();
  const title = (name: string) =>
    page.getByRole("heading", {
      level: 2,
      name: rt("app.orders.till.title", { place: table(name) }),
    });
  const close = page.getByRole("button", {
    name: rt("app.orders.close.place"),
  });
  await page.goto("/design/order-taking/station/till?state=chosen");
  await expect(title("9")).toBeVisible();
  await close.click();
  const closed = page
    .getByRole("status")
    .filter({ hasText: rt("app.orders.toast.closed", { place: table("9") }) });
  await expect(closed).toBeVisible();
  await row("4").click();
  await expect(title("4")).toBeVisible();
  await closed
    .getByRole("button", { name: rt("app.orders.toast.undo") })
    .click();
  await row("9").click();
  await expect(title("9")).toBeVisible();
  await expect(close).toBeEnabled();
  await expect(
    page.getByRole("button", { name: rt("app.orders.close.reopen") }),
  ).toHaveCount(0);
});

// On a phone the order chosen takes the list's place (P8a): one chosen at
// the foot of the till's list opens at the top, its way back and its title
// in sight.
test("the waiter mode demo's till opens an order chosen low in its list at the top", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "the order alone is the phone's",
  );
  await page.goto("/design/order-taking/station/till");
  const last = page
    .getByRole("main")
    .getByRole("button")
    .filter({ visible: true })
    .last();
  await expect(last).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await last.click();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: new RegExp(`^${rt("app.orders.till.title", { place: "" }).trim()}`),
    }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(
    page.getByRole("button", { name: rt("app.orders.station.till.back") }),
  ).toBeInViewport();
});

// The kitchen's gate (P8a) stands in the middle of the screen, with the
// foot under it at the bottom: on a phone, a tablet and a desktop alike.
test("the waiter mode demo's kitchen gate is centred on the screen", async ({
  page,
}) => {
  await page.goto("/design/order-taking/station/prep");
  const open = page.getByRole("button", {
    name: rt("app.orders.station.open"),
  });
  await expect(open).toBeVisible();
  const title = page
    .getByRole("heading", { level: 1 })
    .filter({ visible: true })
    .first();
  const top = (await title.boundingBox())?.y ?? 0;
  const button = await open.boundingBox();
  const bottom = (button?.y ?? 0) + (button?.height ?? 0);
  const height = page.viewportSize()?.height ?? 0;
  expect(Math.abs((top + bottom) / 2 - height / 2)).toBeLessThan(height * 0.15);
});

// The prep screen's lock on the twin (P8a): the kitchen's sheet, with its
// department and the name it offers, goes to the kitchen's twin.
test("the waiter mode demo's prep screen locks the device as the kitchen's screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the walk is the phone's");
  await page.goto("/design/order-taking/prep?state=service");
  await page
    .getByRole("button", { name: rt("app.orders.stations.prep.lock") })
    .click();
  const sheet = page.getByRole("dialog", {
    name: rt("app.orders.stations.lock.prep.title"),
  });
  await expect(sheet.getByRole("radio", { name: "מטבח" })).toBeChecked();
  await expect(
    sheet.getByLabel(rt("app.orders.stations.lock.name")),
  ).toHaveValue(
    rt("app.orders.stations.lock.numbered", { name: "מטבח", n: 2 }),
  );
  await sheet
    .getByRole("button", { name: he.app.clock.station.lock.submit })
    .click();
  await expect(page).toHaveURL(/\/design\/order-taking\/station\/prep$/);
  await expect(
    page.getByRole("button", { name: rt("app.orders.station.open") }),
  ).toBeVisible();
});

// The desktop's table of what Shiran still has to serve reads each line as
// the phone's cards do: table 4's held mains carry the burger's allergy,
// and its starters their note.
test("the waiter mode demo's desktop table shows each line's allergy", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the table is the desktop's");
  const o = he.design.orderTaking;
  await page.goto("/design/order-taking/mine");
  const table = page.getByRole("table", { name: o.mine.tableTitle });
  await expect(table).toBeVisible();
  await expect(
    table.getByText(
      heT("design.orderTaking.line.allergy", { allergy: "שומשום" }),
    ),
  ).toBeVisible();
  await expect(
    table.getByText(heT("design.orderTaking.line.note", { note: "בלי שום" })),
  ).toBeVisible();
});

// A week's dates under the title read left to right, as everywhere else, so
// the first day stands on the left: "1.11–7.11", never "7.11–1.11". The
// schedule tab names its week in words, "1–7 בנובמבר", with the days in an
// isolate (`weekRange`), as in the message its share sends.
const subtitleRange = (sentence: string) => (main: Locator) =>
  main
    .locator("p")
    .filter({ hasText: sentence.split("<")[0] ?? "" })
    .locator('span[dir="ltr"]')
    .first();
const DAY_MONTHS = /^\d{1,2}\.\d{1,2}–\d{1,2}\.\d{1,2}$/;
for (const [path, rangeOn, shape] of [
  [
    "/design/shell/schedule",
    (main: Locator) =>
      main.locator("header p").filter({ hasText: /\d–\d/ }).first(),
    /^\u2066\d{1,2}–\d{1,2}\u2069 \S+$/,
  ],
  [
    "/design/shell/schedule/build",
    subtitleRange(he.app.build.subtitle),
    DAY_MONTHS,
  ],
  [
    "/design/shell/schedule/availability",
    subtitleRange(he.app.availability.subtitle),
    DAY_MONTHS,
  ],
  [
    "/design/shell/schedule/availability/team",
    subtitleRange(he.app.availability.subtitle),
    DAY_MONTHS,
  ],
] as const) {
  test(`the week's dates read left to right on ${path}`, async ({ page }) => {
    await page.goto(path);
    const range = rangeOn(page.getByRole("main"));
    await expect(range).toHaveText(shape);
    // The first date is drawn to the left of the last one.
    const [first, last] = await range.evaluate((element) => {
      const text = element.firstChild;
      if (!text) return [0, 0];
      const words = element.textContent ?? "";
      const at = (start: number) => {
        const r = document.createRange();
        r.setStart(text, start);
        r.setEnd(text, start + 1);
        return r.getBoundingClientRect().left;
      };
      return [at(words.search(/\d/)), at(words.indexOf("–") + 1)];
    });
    expect(first).toBeLessThan(last);
  });
}

// P5 on the twin: a dish cancelled with its reason, kept by the toast's
// undo and cancelled again; the beer given on the house, which the till's
// list marks with its price struck, the cancelled dish left out of it.
test("the waiter mode demo cancels a dish with a reason and its undo, and the manager's on the house shows at the till", async ({
  page,
}, testInfo) => {
  const shown = (locator: Locator) => locator.filter({ visible: true }).first();
  const dialog = page.getByRole("dialog");
  await page.goto(
    "/design/order-taking/floor/order?place=table-4&state=service",
  );
  if (testInfo.project.name === "phone") {
    await shown(
      page.getByRole("button", {
        name: new RegExp(`^${rt("app.orders.order.view.order")}`),
      }),
    ).click();
  }
  const fixHummus = shown(
    page.getByRole("button", {
      name: rt("app.orders.line.fix", { name: "חומוס" }),
    }),
  );
  const mistake = rt("app.orders.reasons.line.mistake");
  await fixHummus.click();
  await expect(dialog).toBeVisible();
  await expectCleanPage(page, "", true);
  // Closed with no choice, the sheet gives the focus back to what opened it.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(fixHummus).toBeFocused();
  await fixHummus.click();
  await dialog.getByRole("button", { name: mistake, exact: true }).click();
  const cancelled = rt("app.orders.line.cancelledWhy", { reason: mistake });
  await expect(shown(page.getByText(cancelled))).toBeVisible();
  await orderUndo(
    page,
    rt("app.orders.toast.cancelled", { name: "חומוס" }),
  ).click();
  await expect(page.getByText(cancelled)).toHaveCount(0);
  await fixHummus.click();
  await dialog.getByRole("button", { name: mistake, exact: true }).click();
  await expect(shown(page.getByText(cancelled))).toBeVisible();

  // The beer, on the house: the cancel held before it goes now.
  await shown(
    page.getByRole("button", {
      name: rt("app.orders.line.fix", { name: "בירה מהחבית" }),
    }),
  ).click();
  await dialog
    .getByRole("button", {
      name: rt("app.orders.reasons.comp.make_good"),
      exact: true,
    })
    .click();
  await expect(
    shown(
      page.getByText(
        rt("app.orders.line.comped", {
          reason: rt("app.orders.reasons.comp.make_good"),
        }),
      ),
    ),
  ).toBeVisible();

  await shown(
    page.getByRole("link", { name: rt("app.orders.rounds.till") }),
  ).click();
  await expect(page).toHaveURL(/\/floor\/till\?order=order-4/);
  const list = shown(
    page.getByRole("list", { name: rt("app.orders.till.byItem") }),
  );
  await expect(list).toContainText(rt("app.orders.till.free"));
  await expect(list).not.toContainText("חומוס");
  await expectCleanPage(page);
});

// Table 2, all served, closed from its till: the floor lists it under
// "נסגרו היום", and its till opens it again.
test("the waiter mode demo closes a table from the till, lists it under נסגרו היום, and opens it again", async ({
  page,
}, testInfo) => {
  const shown = (locator: Locator) => locator.filter({ visible: true }).first();
  const table2 = rt("app.orders.place.numbered", { name: "2" });
  await page.goto(
    "/design/order-taking/floor/till?order=order-2&state=service",
  );
  await shown(
    page.getByRole("button", { name: rt("app.orders.close.place") }),
  ).click();
  await expect(
    page.getByText(rt("app.orders.toast.closed", { place: table2 })),
  ).toBeVisible();
  const reopen = shown(
    page.getByRole("button", { name: rt("app.orders.close.reopen") }),
  );
  await expect(reopen).toBeEnabled();

  await throughTabBar(page, rt("modules.order_taking.mode.places"));
  const closed = page
    .getByRole("main")
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        level: 2,
        name: rt("app.orders.floor.closed.title"),
      }),
    });
  await expect(closed).toBeVisible();
  await expectCleanPage(page);
  await shown(
    closed.getByRole(testInfo.project.name === "desktop" ? "button" : "link", {
      name: new RegExp(`^${asIs(table2)}(\\D|$)`),
    }),
  ).click();
  await expect(page).toHaveURL(/\/floor\/till\?order=order-2/);
  await reopen.click();
  await expect(
    page.getByText(rt("app.orders.toast.reopened", { place: table2 })),
  ).toBeVisible();
  await expect(
    shown(page.getByRole("button", { name: rt("app.orders.close.place") })),
  ).toBeVisible();
});

// Table 4 moves to table 6, free: its page goes there and says where from.
test("the waiter mode demo moves an order to a free table", async ({
  page,
}, testInfo) => {
  const shown = (locator: Locator) => locator.filter({ visible: true }).first();
  await page.goto(
    "/design/order-taking/floor/order?place=table-4&state=service",
  );
  if (testInfo.project.name === "phone") {
    await shown(
      page.getByRole("button", {
        name: new RegExp(`^${rt("app.orders.order.view.order")}`),
      }),
    ).click();
  }
  await shown(
    page.getByRole("button", {
      name: new RegExp(`^${asIs(rt("app.orders.order.actions.move"))}`),
    }),
  ).click();
  const dialog = page.getByRole("dialog");
  const table6 = rt("app.orders.place.numbered", { name: "6" });
  await expect(
    dialog.getByRole("button", {
      name: rt("app.orders.place.numbered", { name: "7" }),
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: table6, exact: true }).click();
  await expect(page).toHaveURL(/place=table-6$/);
  await expect(
    page.getByRole("heading", { level: 1, name: table6 }),
  ).toBeVisible();
  const moved = rt("app.orders.toast.moved", { place: table6 });
  await expect(page.getByText(moved)).toBeVisible();
  await expect(orderUndo(page, moved)).toBeFocused();
  // Under the title, where it came from.
  const from = `${he.app.orders.order.movedFrom.split("{from}")[0] ?? ""}${rt(
    "app.orders.place.numbered",
    { name: "4" },
  )}`;
  await expect(
    shown(page.getByText(new RegExp(`^${asIs(from)}`))),
  ).toBeVisible();
});

// A round that hasn't gone for ten minutes asks (P7): taken off the phone,
// with the toast's "ביטול" taking the focus, back on its undo, then sent;
// on a phone the question shows over the items too, and the floor's tile no
// longer says it hasn't gone.
test("the waiter mode demo's round that waited asks, comes back on its undo, and goes", async ({
  page,
}, testInfo) => {
  const shown = (locator: Locator) => locator.filter({ visible: true }).first();
  const table6 = rt("app.orders.place.numbered", { name: "6" });
  const question = rt("app.orders.outbox.ask", { count: 12 });
  await page.goto(
    "/design/order-taking/floor/order?place=table-6&state=asking",
  );
  // The phone opens on the order, where the round is; over the items too.
  await expect(shown(page.getByText(question))).toBeVisible();
  if (testInfo.project.name === "phone") {
    await shown(
      page.getByRole("button", {
        name: new RegExp(`^${asIs(rt("app.orders.order.view.add"))}`),
      }),
    ).click();
    await expect(shown(page.getByText(question))).toBeVisible();
  }
  await shown(
    page.getByRole("button", {
      name: rt("app.orders.outbox.removeLabel", { place: table6 }),
    }),
  ).click();
  const removed = rt("app.orders.toast.roundRemoved", { place: table6 });
  await expect(page.getByText(removed)).toBeVisible();
  await expect(orderUndo(page, removed)).toBeFocused();
  await orderUndo(page, removed).click();
  await expect(shown(page.getByText(question))).toBeVisible();
  await shown(
    page.getByRole("button", {
      name: rt("app.orders.outbox.sendLabel", { place: table6 }),
    }),
  ).click();
  await expect(page.getByText(question).filter({ visible: true })).toHaveCount(
    0,
  );
  await shown(
    page.getByRole("link", { name: rt("app.orders.order.noPlace.back") }),
  ).click();
  await expect(page).toHaveURL(/\/design\/order-taking\/floor$/);
  const tile6 = shown(
    page.getByRole("link", {
      name: new RegExp(`^${asIs(rt("app.orders.place.kind"))}\\s*6(\\D|$)`),
    }),
  );
  await expect(tile6).toBeVisible();
  await expect(tile6).not.toContainText(rt("app.orders.floor.state.unsent"));
});

// The kitchen strikes table 4's hummus, and still makes its focaccia. Its
// held mains are a ticket of their own, after it.
test("the waiter mode demo's kitchen strikes a cancelled dish", async ({
  page,
}) => {
  await page.goto("/design/order-taking/prep?state=fixed");
  const ticket = page
    .getByRole("article", {
      name: rt("app.orders.prep.label", {
        place: rt("app.orders.place.numbered", { name: "4" }),
        department: "מטבח",
      }),
    })
    .filter({ visible: true })
    .first();
  await expect(ticket).toContainText(rt("app.orders.line.cancelled"));
  await expect(ticket).toContainText("פוקאצ'ה");
});

// The owner's line on taking orders' settings: the day's counts, no shekels,
// leading to the activity log.
test("the owner's line counts the day's fixes", async ({ page }) => {
  await page.goto("/design/shell/manage/order_taking");
  const line = page.getByRole("link", {
    name: new RegExp(
      `^${asIs(heT("app.manage.orderFixes.today", { takenBack: 3, cancelled: 2, comped: 1 }))}`,
    ),
  });
  await expect(line.filter({ visible: true })).toBeVisible();
  await expect(line).toHaveAttribute("href", "/design/shell/manage/activity");
  await expect(line).not.toContainText("₪");
});

// The file demo, hydrated: its buttons answer and its boxes are laid out
// (CI pressed and measured before it was, twice).
async function openFileDemo(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

// The holders' view of the file on its twins (profile H6a): the duties, the
// twin's code (123456) and the file open, its account shown for a minute;
// the hour's limit in words; a manager's count with no way in; the
// accountant's Home leading to the files, and on to a file as the
// accountant reads it; and a link to /me/file that names nothing missing.
// The twins keep nothing.
const hf = he.app.team.file;

test("the file twin opens with the duties, then a code, and the account shows for a minute", async ({
  page,
}) => {
  await page.clock.install();
  await openFileDemo(page, "/design/shell/team/noa/file");
  await expect(
    page.getByRole("heading", { name: hf.duties.title }),
  ).toBeVisible();
  // The file's own check as it opens is answered before the minute below
  // passes, on the twin's channel (`hearFileCheck`).
  const checked = await hearFileCheck(page, FILE_TABS_TWIN_CHANNEL);
  await page.getByRole("button", { name: hf.duties.confirm }).click();
  const boxes = page.getByLabel(hf.code.label);
  await expect(boxes).toBeVisible();
  await boxes.fill("123456");
  await expect(page).toHaveURL(/\/design\/shell\/team\/noa\/file\?state=open$/);
  await checked();
  const bank = page.getByRole("region", { name: hf.sections.bank });
  await expect(bank.getByText("•••0001")).toBeVisible();
  await bank.getByRole("button", { name: he.app.file.masked.show }).click();
  await expect(bank.getByText("100001")).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(bank.getByText("100001")).toHaveCount(0);
  await expect(bank.getByText("•••0001")).toBeVisible();
});

// The week after the holder's own phone change (20261127000400): no code
// goes, and the card says from when the files open.
test("the file twin held after a phone change says when the files open, with no code to send", async ({
  page,
}) => {
  await openFileDemo(page, "/design/shell/team/noa/file?state=held");
  await expect(
    page.getByRole("heading", { name: hf.locked.title }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: hf.code.phoneHold.split("{date}")[0] ?? "" }),
  ).toHaveText(
    heT("app.team.file.code.phoneHold", { date: "27 בנובמבר 2026" }),
  );
  await expect(
    page.getByRole("button", { name: hf.locked.send }),
  ).toBeDisabled();
  await expect(page.getByLabel(hf.code.label)).toHaveCount(0);
});

test("the file twin's reveal over the limit says so in words", async ({
  page,
}) => {
  await openFileDemo(page, "/design/shell/team/noa/file?state=limit");
  const identity = page.getByRole("region", { name: hf.sections.identity });
  await identity.getByRole("button", { name: he.app.file.masked.show }).click();
  await expect(identity.getByRole("alert")).toHaveText(hf.reveal.limit);
  await expect(identity.getByText("000000018")).toHaveCount(0);
  await expect(
    identity.getByRole("button", { name: he.app.file.masked.show }),
  ).toBeEnabled();
});

test("the manager's twin sees a count and no way into the file", async ({
  page,
}) => {
  await openFileDemo(page, "/design/shell/team/yoav?file=manager");
  await expect(
    page.getByText(heT("app.team.file.card.missingCount", { count: 2 })),
  ).toBeVisible();
  await expect(page.getByText(hf.card.onlyHolders)).toBeVisible();
  await expect(
    page.getByRole("link", { name: hf.card.open }).filter({ visible: true }),
  ).toHaveCount(0);
  for (const group of Object.values(hf.groups)) {
    await expect(page.getByRole("main").getByText(group)).toHaveCount(0);
  }
});

test("the accountant's Today twin leads to the files", async ({ page }) => {
  await openFileDemo(page, "/design/shell/today/accountant?files=missing");
  const card = page.getByRole("region", {
    name: he.app.home.accountant.files.title,
  });
  await expect(
    card.getByText(heT("app.home.accountant.files.missing", { count: 2 })),
  ).toBeVisible();
  await card
    .getByRole("link", { name: he.app.home.accountant.files.open })
    .click();
  await expect(page).toHaveURL(/\/design\/shell\/team\?file=accountant$/);
  await expect(page.getByText(hf.filesOnly.note)).toBeVisible();
  const yoav = page
    .getByRole("link", { name: /יואב לוי/ })
    .filter({ visible: true })
    .first();
  await expect(yoav).toHaveAttribute(
    "href",
    "/design/shell/team/yoav/file?as=accountant",
  );

  // The file as the accountant reads it: back to the files, and no link to
  // send from a profile the accountant never sees.
  await yoav.click();
  await expect(page).toHaveURL(
    /\/design\/shell\/team\/yoav\/file\?as=accountant$/,
  );
  await page.waitForLoadState("networkidle");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: hf.page.backTeam, exact: true }),
  ).toHaveAttribute("href", "/design/shell/team?file=accountant");
  await main.getByRole("button", { name: hf.duties.confirm }).click();
  await page.getByLabel(hf.code.label).fill("123456");
  await expect(page).toHaveURL(
    /\/design\/shell\/team\/yoav\/file\?state=open&as=accountant$/,
  );
  await expect(
    main.getByText(hf.rows.missing, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    main.getByText(heT("app.team.file.rows.missingHint", { first: "יואב" })),
  ).toHaveCount(0);
});

test("Yoav's twin shares a link to /me/file that names no detail", async ({
  page,
}) => {
  await openFileDemo(page, "/design/shell/team/yoav?file=holder");
  await page
    .getByRole("button", { name: hf.card.share })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", { name: hf.card.shareTitle });
  await expect(sheet).toBeVisible();
  const message = (await sheet.textContent()) ?? "";
  expect(message).toContain("/me/file");
  for (const group of Object.values(hf.groups)) {
    expect(message).not.toContain(group);
  }
});

// The worker's own file on Noa's twin (profile H5a). An account number the
// check doubts is said in words, kept with "המספר נכון, לשמור", and saved
// past the twin's code; the twin keeps nothing.
test("the file demo warns about an account number in words and saves past it", async ({
  page,
}) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=bank&state=warning");
  const bank = page.getByRole("region", { name: f.steps.name.bank });
  await expect(bank.getByText(f.bank.warning.checkDigit)).toBeVisible();
  // The step's own: the dock's on a phone and a tablet, the section's on a
  // desktop (whose summary offers the same press).
  const confirm = bank
    .getByRole("button", { name: f.bank.confirm, exact: true })
    .filter({ visible: true });
  // Only the warning is in the way: said above the action, which can be
  // pressed and takes the person to the number.
  const checkFirst = page
    .getByText(heT("app.file.bank.checkFirst", { keep: f.bank.keep }))
    .filter({ visible: true });
  await expect(checkFirst).toBeVisible();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(bank.getByLabel(f.bank.account)).toBeFocused();
  await expect(page.getByLabel(f.bank.code.label)).toHaveCount(0);
  await bank.getByRole("button", { name: f.bank.keep }).click();
  await expect(
    bank.getByText(heT("app.file.bank.kept", { business: "מסעדת הדגמה" })),
  ).toBeVisible();
  await expect(checkFirst).toHaveCount(0);
  await confirm.click();
  const code = page.getByLabel(f.bank.code.label);
  await expect(code).toBeVisible();
  await code.fill("123456");
  await expect(
    bank.getByText(
      heT("app.file.bank.savedWarned", { business: "מסעדת הדגמה" }),
    ),
  ).toBeVisible();
  await expect(bank.getByText("•••0002")).toBeVisible();
  await expectCleanPage(page);
});

test("the file demo's own ID shows for a minute", async ({ page }) => {
  const f = he.app.file;
  await page.clock.install();
  await openFileDemo(page, "/design/shell/me/file?step=identity");
  const identity = page.getByRole("region", { name: f.steps.name.identity });
  await expect(identity.getByText("•••0018")).toBeVisible();
  await identity.getByRole("button", { name: f.masked.show }).click();
  await expect(identity.getByText("000000018")).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(identity.getByText("•••0018")).toBeVisible();
  await expect(identity.getByText("000000018")).toHaveCount(0);
});

// One step at a time under the steps bar on a phone, the steps beside the
// one on screen on a tablet, and every step with the summary's one main
// action on a desktop: the same file, the same words.
test("the file demo reads the same in each device's shape", async ({
  page,
}, testInfo) => {
  const f = he.app.file;
  const project = testInfo.project.name;
  await openFileDemo(page, "/design/shell/me/file");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: heT("app.file.title", { business: "מסעדת הדגמה" }),
    }),
  ).toBeVisible();
  // The steps' own sections, by their titles.
  const sections = page
    .getByRole("region", {
      name: new RegExp(`^(${Object.values(f.steps.name).join("|")})$`),
    })
    .filter({ visible: true });
  const steps = page
    .getByRole("complementary", { name: f.steps.title })
    .filter({ visible: true });
  // Stopped at the account, the step on screen: the summary's one main
  // action is the account's own, never a way to where the person is.
  const main = steps.getByRole("button", { name: f.bank.confirm });
  const toBank = page
    .getByRole("button", { name: f.actions.finish.bank })
    .filter({ visible: true });
  if (project === "phone") {
    await expect(
      page.getByText(heT("app.file.steps.count", { current: 4, count: 6 })),
    ).toBeVisible();
    await expect(sections).toHaveCount(1);
    await expect(steps).toHaveCount(0);
  } else if (project === "tablet") {
    await expect(steps).toHaveCount(1);
    await expect(sections).toHaveCount(1);
    await expect(
      steps.getByRole("link", {
        name: `${f.steps.name.bank} · ${f.steps.state.open}`,
      }),
    ).toHaveAttribute("aria-current", "step");
  } else {
    await expect(steps).toHaveCount(1);
    await expect(sections).toHaveCount(6);
    await expect(main).toBeVisible();
    await expect(toBank).toHaveCount(0);
  }
  await expect(
    page.getByRole("region", { name: f.steps.name.bank }),
  ).toBeVisible();
});

// On a desktop the step that keeps the file back is on screen already: the
// summary's accent action does what that step's own does, so a press always
// shows something (H5a's check of the second review): it says what is
// missing and goes there, sends the code, offers nothing while the code's
// boxes are up (as the dock doesn't: the code confirms itself), and goes on
// once the account is in (H5a's last check).
test("the file demo's summary does the open step's own action on a desktop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The summary is a desktop's.");
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file");
  const bank = page.getByRole("region", { name: f.steps.name.bank });
  const summary = page.getByRole("complementary", { name: f.steps.title });
  const own = summary.getByRole("button", { name: f.bank.confirm });
  await expect(own).toBeEnabled();

  await own.click();
  await expect(bank.locator('[aria-invalid="true"]').first()).toBeFocused();
  await expect(
    bank
      .getByText(heT("app.file.missingRequired", { count: 5 }))
      .filter({ visible: true }),
  ).toBeVisible();

  await bank.getByLabel(f.bank.paste).fill("12-600-100001");
  await bank.getByRole("radio", { name: f.bank.self, exact: true }).check();
  await bank
    .getByRole("checkbox", {
      name: heT("app.file.bank.instruction", {
        form: "f",
        business: "מסעדת הדגמה",
      }),
    })
    .check();
  await own.click();
  const code = page.getByLabel(f.bank.code.label);
  await expect(code).toBeVisible();
  // With the boxes up, no press named for a confirmation that only moves
  // the focus: why the file waits is said, and the digits stay.
  await code.pressSequentially("12");
  await expect(own).toHaveCount(0);
  await expect(summary.getByText(f.actions.sendWaits)).toBeVisible();
  await expect(bank.locator('input[name="code"]')).toHaveValue("12");

  await code.pressSequentially("3456");
  await expect(
    bank.getByText(heT("app.file.bank.saved", { business: "מסעדת הדגמה" })),
  ).toBeVisible();
  await summary.getByRole("button", { name: f.actions.continue }).click();
  await expect(page).toHaveURL(/step=pension/);
});

// Pension, the step on screen with nothing chosen: the summary's action says
// so and goes to the first answer.
test("the file demo's summary marks the pension's answer on a desktop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The summary is a desktop's.");
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?state=saved&step=pension");
  const pension = page.getByRole("region", { name: f.steps.name.pension });
  await page
    .getByRole("complementary", { name: f.steps.title })
    .getByRole("button", { name: f.actions.savePension })
    .click();
  await expect(
    pension.getByRole("radio", { name: f.pension.yes }),
  ).toBeFocused();
  await expect(page).toHaveURL(/step=pension/);
});

/** A step's main action: the dock's on a phone and a tablet, its own save on a desktop. */
const fileStepAction = (
  page: Page,
  region: Locator,
  project: string,
  desktopLabel: string,
) =>
  project === "desktop"
    ? region.getByRole("button", { name: desktopLabel })
    : page
        .getByRole("button", { name: he.app.file.actions.next, exact: true })
        .filter({ visible: true });

// Every refusal of a filled step has words, and its main action can be
// pressed to show them: an old five-digit zip, an apartment past its ten
// characters, a birth year of two digits.
test("the file demo says under each field what keeps a step from saving", async ({
  page,
}, testInfo) => {
  const f = he.app.file;
  const project = testInfo.project.name;
  await openFileDemo(page, "/design/shell/me/file?step=address");
  const address = page.getByRole("region", { name: f.steps.name.address });
  const apartment = address.getByLabel(
    heT("app.file.optionalField", { field: f.address.apartment }),
  );
  await apartment.fill("12345678901");
  await expect(
    address.getByText(
      f.tooLong.replace(/<\/?ltr>/g, "").replace("{max}", "10"),
    ),
  ).toBeVisible();
  await apartment.fill("3");
  await address
    .getByLabel(heT("app.file.optionalField", { field: f.address.zip }))
    .fill("61000");
  const saveAddress = fileStepAction(
    page,
    address,
    project,
    f.actions.saveAddress,
  );
  await expect(saveAddress).toBeEnabled();
  await saveAddress.click();
  await expect(address.getByText(f.address.zipInvalid)).toBeVisible();
  await expect(page).toHaveURL(/step=address/);

  await openFileDemo(page, "/design/shell/me/file?step=identity");
  const identity = page.getByRole("region", { name: f.steps.name.identity });
  const year = identity
    .getByRole("group", { name: f.identity.birthDate })
    .getByLabel(f.date.year);
  await year.fill("95");
  await year.blur();
  await expect(identity.getByText(f.date.yearShort)).toBeVisible();
  // Every box shows a value: nothing is said to be missing.
  await expect(
    page.getByText(heT("app.file.missingRequired", { count: 1 })),
  ).toHaveCount(0);
  await expect(
    fileStepAction(page, identity, project, f.actions.saveIdentity),
  ).toBeEnabled();
});

// A town typed and left: the one it names is chosen; a choice made stays
// until another is; and words that choose nothing say so.
test("the file demo never takes a town typed for one chosen", async ({
  page,
}) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=address");
  const address = page.getByRole("region", { name: f.steps.name.address });
  const town = address.getByRole("combobox", { name: f.address.city });
  await expect(town).toHaveValue("תל אביב - יפו");

  await town.fill("חיפה");
  await expect(
    page.getByRole("option", { name: "חיפה", exact: true }),
  ).toBeVisible();
  await town.blur();
  await expect(town).toHaveValue("חיפה");

  // Several towns: the one chosen before stays.
  await town.fill("מודיעין");
  await expect(page.getByRole("option").first()).toBeVisible();
  await town.blur();
  await expect(town).toHaveValue("חיפה");
  await expect(address.getByText(f.address.cityUnpicked)).toHaveCount(0);

  // Emptied, then words that choose nothing: said under the field.
  await town.fill("");
  await town.blur();
  await town.fill("מודיעין");
  await expect(page.getByRole("option").first()).toBeVisible();
  await town.blur();
  await expect(town).toHaveValue("מודיעין");
  await expect(address.getByText(f.address.cityUnpicked)).toBeVisible();
  await expect(town).toHaveAttribute("aria-invalid", "true");
});

// The English file draws its dock in a left-to-right frame inside the
// Hebrew shell: shrunk on a phone, the tab bar keeps its corner and the
// dock stays beside it, never over it.
test("the file demo in English keeps its dock beside the shrunk tab bar", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Only a phone's bar shrinks.");
  await page.setViewportSize({ width: 390, height: 600 });
  await openFileDemo(page, "/design/shell/me/file?lang=en&step=address");
  const next = page
    .getByRole("button", { name: en.app.file.actions.next, exact: true })
    .filter({ visible: true });
  await expect(next).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect(page.locator("nav[data-tab-compact]")).toHaveCount(1);
  const bar = page.locator("nav[data-tab-compact] ul");
  await expect
    .poll(async () => {
      const [button, tabs] = await Promise.all([
        next.boundingBox(),
        bar.boundingBox(),
      ]);
      if (!button || !tabs) return "unseen";
      const apart =
        button.x + button.width <= tabs.x + 1 ||
        tabs.x + tabs.width <= button.x + 1;
      return apart ? "beside" : "over";
    })
    .toBe("beside");
});

// A laptop leaves less than the screen's 900px: the summary's action stays
// in view beside the steps, a new file's six included. A new file has
// nothing to send yet: the welcome's way in is the page's main action, and
// the summary's leads, quiet, to the first detail.
test("the file demo keeps its main action in view on a laptop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The summary is a desktop's.");
  await page.setViewportSize({ width: 1440, height: 780 });
  await openFileDemo(page, "/design/shell/me/file?state=new");
  const f = he.app.file;
  await expect(
    page
      .getByRole("button", { name: f.welcome.start })
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: heT("app.file.actions.send", { business: "מסעדת הדגמה" }),
    }),
  ).toHaveCount(0);
  const finish = page
    .getByRole("button", { name: f.actions.finish.identity })
    .filter({ visible: true });
  await expect(finish).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(finish).toBeInViewport({ ratio: 1 });
});

// The welcome's card over the hero grows down as its words do (a narrow
// phone, larger text), never up over the title.
test("the file demo's welcome keeps its card under the title", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "A narrow phone's.");
  await page.setViewportSize({ width: 320, height: 700 });
  await openFileDemo(page, "/design/shell/me/file?state=new");
  const title = page.getByText(
    heT("app.file.welcome.title", { business: "מסעדת הדגמה" }),
  );
  const card = page
    .getByText(heT("app.file.welcome.body", { count: 6 }))
    .locator("..");
  await expect(title).toBeVisible();
  await expect(card).toBeVisible();
  const [titleBox, cardBox] = await Promise.all([
    title.boundingBox(),
    card.boundingBox(),
  ]);
  expect(titleBox && cardBox).toBeTruthy();
  if (!titleBox || !cardBox) return;
  expect(cardBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
});

// The twin keeps nothing, so its language is its address: the button above
// and step 0 switch it there, and step 0 shows the file's language until
// one is picked on it (H5a's second review).
test("the file demo switches language with the button, and step 0 follows", async ({
  page,
}) => {
  const f = he.app.file;
  const e = en.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=start");
  await page.getByRole("button", { name: f.language.switch }).click();
  await expect(page).toHaveURL(/[?&]lang=en/);
  const english = page.locator('[dir="ltr"][lang="en"]');
  const first = english.getByRole("region", { name: e.steps.name.start });
  await expect(first.getByRole("radio", { name: e.start.en })).toBeChecked();
  await expect(
    first.getByRole("radio", { name: e.start.he }),
  ).not.toBeChecked();
  await english.getByRole("button", { name: e.language.switch }).click();
  await expect(page).not.toHaveURL(/lang=en/);
  await expect(
    page
      .getByRole("region", { name: f.steps.name.start })
      .getByRole("radio", { name: f.start.he }),
  ).toBeChecked();
});

// A step opened from another takes the focus at its title: a keyboard and a
// screen reader go on from there, not from the top of the page.
test("the file demo puts the focus on the step it opens", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "desktop",
    "The dock is a phone's and a tablet's.",
  );
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=start");
  await page
    .getByRole("button", { name: f.actions.next, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/step=identity/);
  await expect(
    page.getByRole("heading", { level: 2, name: f.steps.name.identity }),
  ).toBeFocused();
});

// A desktop's account says what is missing beside its own action, which can
// always be pressed, and goes to the first field it is about.
test("the file demo's account on a desktop says what is missing", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "A desktop's own save.");
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=bank");
  const bank = page.getByRole("region", { name: f.steps.name.bank });
  const confirm = bank.getByRole("button", { name: f.bank.confirm });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    bank
      .getByText(heT("app.file.missingRequired", { count: 5 }))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(bank.locator('[aria-invalid="true"]').first()).toBeFocused();
});

// The steps' lifted shadow is never cut into a box: a tablet's list has no
// scroll box at all, and a desktop's leaves the shadow its room.
test("the file demo's steps keep their shadow whole", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "A phone has no list beside.");
  await openFileDemo(page, "/design/shell/me/file");
  const box = page
    .getByRole("complementary", { name: he.app.file.steps.title })
    .getByRole("list")
    .first()
    .locator("..");
  const style = await box.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      overflow: css.overflowY,
      start: Number.parseFloat(css.paddingInlineStart),
      end: Number.parseFloat(css.paddingInlineEnd),
    };
  });
  if (testInfo.project.name === "tablet") {
    expect(style.overflow).toBe("visible");
  } else {
    // The float shadow reaches about 30px beside the list.
    expect(style.start).toBeGreaterThanOrEqual(30);
    expect(style.end).toBeGreaterThanOrEqual(30);
  }
});

// A desktop shows every step at once: one way back to the profile (above
// them) and one way to the notice (beside them), never one per step.
test("the file demo says 'later' and a step's 'why' only below a desktop", async ({
  page,
}, testInfo) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=address");
  const later = page
    .getByRole("link", { name: f.actions.later })
    .filter({ visible: true });
  const why = page
    .getByRole("button", { name: f.why, exact: true })
    .filter({ visible: true });
  const expected = testInfo.project.name === "desktop" ? 0 : 1;
  await expect(later).toHaveCount(expected);
  await expect(why).toHaveCount(expected);
});

// The file goes only once its details are in: until then its action leads
// to the first one open. Done says "סיימת" only with nothing open, and its
// main action is the way back to the profile.
test("the file demo sends only a file with its details in", async ({
  page,
}) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=form101");
  await expect(
    page.getByRole("button", {
      name: heT("app.file.actions.send", { business: "מסעדת הדגמה" }),
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: f.actions.finish.bank })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/step=bank/);

  await openFileDemo(page, "/design/shell/me/file?step=done");
  await expect(
    page.getByRole("heading", {
      name: heT("app.file.done.titleLeft", { count: 3 }),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: f.done.title, exact: true }),
  ).toHaveCount(0);

  await openFileDemo(page, "/design/shell/me/file?state=done");
  await expect(
    page.getByRole("heading", { name: f.done.title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: f.done.profile })
    .filter({ visible: true })
    .click();
  // Back to the profile's twin that tells this same file: everything in.
  await expect(page).toHaveURL(/\/design\/shell\/me\?file=done$/);
});

// A number shown and the screen left: Next keeps the screen to show again,
// and it comes back with the dots, never the number.
test("the file demo's own ID is hidden again after leaving the screen", async ({
  page,
}) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=identity");
  const identity = page.getByRole("region", { name: f.steps.name.identity });
  await identity.getByRole("button", { name: f.masked.show }).click();
  await expect(identity.getByText("000000018")).toBeVisible();
  await page.getByRole("link", { name: f.back, exact: true }).click();
  await expect(page).toHaveURL(/\/design\/shell\/me\?file=missing$/);
  await page.goBack();
  await expect(page).toHaveURL(/step=identity/);
  await expect(identity.getByText("•••0018")).toBeVisible();
  await expect(page.getByText("000000018")).toHaveCount(0);
});

// "החלפת החשבון" by mistake: "השארת החשבון הנוכחי" goes back to the saved one.
test("the file demo goes back to the saved account", async ({ page }) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=bank&state=saved");
  const bank = page.getByRole("region", { name: f.steps.name.bank });
  await bank.getByRole("button", { name: f.bank.change }).click();
  await expect(bank.getByLabel(f.bank.paste)).toBeFocused();
  await bank.getByRole("button", { name: f.bank.keepCurrent }).click();
  await expect(bank.getByText("•••0001")).toBeVisible();
  await expect(bank.getByLabel(f.bank.paste)).toHaveCount(0);
});

// The week after a phone change: the day it opens, and no code until then.
test("the file demo holds the account's code after a phone change", async ({
  page,
}, testInfo) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=bank&state=hold");
  const words = heT("app.file.bank.phoneHold", { date: "27 בנובמבר 2026" });
  const bank = page.getByRole("region", { name: f.steps.name.bank });
  await expect(bank.getByText(words).filter({ visible: true })).toBeVisible();
  await expect(
    bank
      .getByRole("button", { name: f.bank.confirm, exact: true })
      .filter({ visible: true }),
  ).toBeDisabled();
  if (testInfo.project.name !== "desktop") return;
  // The summary's action is the account's own: held too, and says why.
  const summary = page.getByRole("complementary", { name: f.steps.title });
  await expect(
    summary.getByRole("button", { name: f.bank.confirm }),
  ).toBeDisabled();
  await expect(summary.getByText(words)).toBeVisible();
});

// A move with this year's 101 handed in: an updated one is due within a
// week, said on the address step, which stays; the same press again goes
// on. The address saved as it was is no move, and goes on at once, as in
// the app.
test("the file demo says an updated 101 is due after a move", async ({
  page,
}, testInfo) => {
  const f = he.app.file;
  const project = testInfo.project.name;
  await openFileDemo(page, "/design/shell/me/file?state=done&step=address");
  const address = page.getByRole("region", { name: f.steps.name.address });
  const save = fileStepAction(page, address, project, f.actions.saveAddress);
  const due = address.getByText(
    heT("app.file.changeDue", { date: "1 בדצמבר 2026" }),
  );
  await address.getByLabel(f.address.number, { exact: true }).fill("14");
  await save.click();
  await expect(due).toBeVisible();
  await expect(page).toHaveURL(/step=address/);
  await save.click();
  await expect(page).toHaveURL(/step=bank/);

  await openFileDemo(page, "/design/shell/me/file?state=done&step=address");
  await save.click();
  await expect(page).toHaveURL(/step=bank/);
  await expect(due).toHaveCount(0);
});

// A document's number too short says how many characters it needs.
test("the file demo says how long a document's number needs to be", async ({
  page,
}, testInfo) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=identity");
  const identity = page.getByRole("region", { name: f.steps.name.identity });
  await identity
    .getByRole("radio", { name: f.identity.other, exact: true })
    .check();
  await identity.getByLabel(f.identity.otherName).fill("תעודת עובד");
  await identity.getByLabel(f.identity.otherNumber).fill("AB1");
  await fileStepAction(
    page,
    identity,
    testInfo.project.name,
    f.actions.saveIdentity,
  ).click();
  await expect(
    identity.getByText(
      heT.markup("app.file.identity.documentShort", {
        min: 4,
        ltr: (chunks: string) => chunks,
      }),
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/step=identity/);
});

// What each business asks of the hiring file (profile H5b), on Noa's twin:
// steps left out, Form 101's link, the send on the done screen, Today's bank
// change, and the owner's settings typed left to right. Nothing is kept.
test("the file demo leaves out what the business doesn't ask", async ({
  page,
}, testInfo) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?ask=lean");
  await expect(
    page.getByRole("region", { name: f.steps.name.bank, exact: true }),
  ).toHaveCount(0);
  if (testInfo.project.name === "phone") {
    await expect(
      page.getByText(heT("app.file.steps.count", { current: 3, count: 4 })),
    ).toBeVisible();
  } else {
    await expect(
      page
        .getByRole("complementary", { name: f.steps.title })
        .getByRole("list")
        .first()
        .getByRole("listitem"),
    ).toHaveCount(4);
  }
  if (testInfo.project.name === "desktop") {
    const sections = page
      .getByRole("region", {
        name: new RegExp(`^(${Object.values(f.steps.name).join("|")})$`),
      })
      .filter({ visible: true });
    await expect(sections).toHaveCount(4);
    // The summary's main action is the open step's own: the pension's.
    await expect(
      page
        .getByRole("complementary", { name: f.steps.title })
        .getByRole("button", { name: f.actions.savePension }),
    ).toBeVisible();
  }
  // The way back is to the profile as this business asks the file.
  await expect(
    page.getByRole("link", { name: f.back, exact: true }),
  ).toHaveAttribute("href", "/design/shell/me?file=lean");
  await openFileDemo(page, "/design/shell/me/file?ask=contact&step=address");
  await expect(
    page.getByRole("link", { name: f.back, exact: true }),
  ).toHaveAttribute("href", "/design/shell/me?file=contact");
  await expectCleanPage(page);
});

// Step 2 asked only for the ways to reach her is optional: a new worker has
// done nothing yet, and the progress says so, as the welcome counts it.
test("the file demo counts an optional step only once something of it is in", async ({
  page,
}) => {
  await openFileDemo(page, "/design/shell/me/file?ask=contact&state=new");
  await expect(
    page.getByText(heT("app.file.progress", { done: 0, count: 5 })),
  ).toBeVisible();
  await expect(
    page.getByText(heT("app.file.welcome.body", { count: 5 })),
  ).toBeVisible();
});

test("the file demo's 101 link opens the provider and shows its domain", async ({
  page,
}, testInfo) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?form101=link&step=form101");
  const form = page.getByRole("region", {
    name: f.steps.name.form101,
    exact: true,
  });
  const open = form.getByRole("link", {
    name: heT("app.file.form101.open", { provider: "משרד השכר" }),
  });
  await expect(open).toHaveAttribute("href", "https://101.example/noa");
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    form.getByText("נפתח באתר 101.example, בחלון חדש"),
  ).toBeVisible();
  await expect(form.getByText(f.form101.handOver)).toHaveCount(0);
  // On a phone its two actions are as wide as each other: the card's width.
  if (testInfo.project.name === "phone") {
    const handedIn = form.getByRole("button", { name: f.form101.handedIn });
    const [link, button] = await Promise.all([
      open.boundingBox(),
      handedIn.boundingBox(),
    ]);
    expect(Math.round(button?.width ?? 0)).toBe(Math.round(link?.width ?? 1));
  }
  await expectCleanPage(page);
});

// A fund chosen "later" all that is left: the done screen, Today's card and
// the profile's lead to the pension's step, not to "סיימת"; the cards to the
// very file they told, whose way back is to the profile that tells it.
test("the file demo leads to the pension when a fund chosen later is all that is left", async ({
  page,
}, testInfo) => {
  const f = he.app.file;
  const onPension = async () => {
    await expect(page).toHaveURL(
      /\/design\/shell\/me\/file\?step=pension&state=later$/,
    );
    await page.waitForLoadState("networkidle");
    const pension = page.getByRole("region", {
      name: f.steps.name.pension,
      exact: true,
    });
    await expect(
      pension.getByRole("radio", { name: f.pension.choose, exact: true }),
    ).toBeChecked();
    await expect(
      pension.getByRole("button", {
        name: `${f.pension.which} ${f.pension.later}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(heT("app.file.progress", { done: 6, count: 6 })),
    ).toBeVisible();
    if (testInfo.project.name !== "phone") {
      const steps = page.getByRole("complementary", { name: f.steps.title });
      await expect(
        steps.getByRole("link", {
          name: `${f.steps.name.bank} · ${f.steps.state.done}`,
        }),
      ).toBeVisible();
      await expect(
        steps.getByRole("link", {
          name: `${f.steps.name.pension} · ${f.steps.state.done}`,
        }),
      ).toContainText(
        heT("app.file.done.leftPension", { date: "24 בדצמבר 2026" }),
      );
    }
    const back = page.getByRole("link", { name: f.back, exact: true });
    await expect(back).toHaveAttribute("href", "/design/shell/me?file=later");
    await back.click();
    await expect(page).toHaveURL(/\/design\/shell\/me\?file=later$/);
    await page.waitForLoadState("networkidle");
  };

  await openFileDemo(page, "/design/shell/me/file?state=later");
  await expect(
    page.getByRole("heading", { name: f.done.titlePension }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: f.done.title, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: f.actions.choosePension })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/step=pension/);

  await page.goto("/design/shell/today/worker?file=pension");
  await page.waitForLoadState("networkidle");
  const today = page.getByRole("main");
  await expect(
    today.getByText(heT("app.me.file.pensionLeft", { date: "24 בדצמבר" })),
  ).toBeVisible();
  const fromToday = today.getByRole("link", { name: f.actions.choosePension });
  await expect(fromToday).toHaveAttribute(
    "href",
    "/design/shell/me/file?step=pension&state=later",
  );
  await expectCleanPage(page);
  await fromToday.click();
  await onPension();

  // Landed on the profile that tells the same file: its card goes there too.
  const fromProfile = page
    .getByRole("main")
    .getByRole("link", { name: f.actions.choosePension });
  await expect(fromProfile).toHaveAttribute(
    "href",
    "/design/shell/me/file?step=pension&state=later",
  );
  await fromProfile.click();
  await onPension();
});

// The account's change in the bank step, while Today tells it: "לא שיניתי"
// stays reachable there once Today's card is hidden.
test("the file demo's bank step keeps 'לא שיניתי' while the change is told", async ({
  page,
}) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?step=bank&state=saved");
  const bank = page.getByRole("region", { name: f.steps.name.bank });
  await expect(
    bank.getByText(heT("app.file.bank.changed", { date: "24 בנובמבר 2026" })),
  ).toBeVisible();
  await bank.getByRole("button", { name: f.bank.dispute }).click();
  const words = bank.getByText(
    heT("app.file.bank.disputed", { business: "מסעדת הדגמה" }),
  );
  await expect(words).toBeVisible();
  // The button it was on went: its words have the focus.
  await expect(words).toBeFocused();
  await expect(bank.getByRole("button", { name: f.bank.dispute })).toHaveCount(
    0,
  );
  await expectCleanPage(page);
});

test("the file demo sends from the done screen when Form 101 is off", async ({
  page,
}) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/shell/me/file?form101=off&state=ready");
  await expect(
    page.getByText(heT("app.file.done.ready", { business: "מסעדת הדגמה" })),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: f.steps.name.form101, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: heT("app.file.actions.send", { business: "מסעדת הדגמה" }),
    })
    .filter({ visible: true })
    .first()
    .click();
  // The twin's stand-in answers, and the done screen stays: the send is
  // said, and its title has the focus, as the button pressed doesn't stay.
  await expect(page).toHaveURL(/step=done/);
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.file.done.sent", { business: "מסעדת הדגמה" }),
    }),
  ).toBeVisible();
  await expect(page.locator("#file-done-title")).toBeFocused();
  await expectCleanPage(page);
});

// "אני שיניתי" and "הבנתי" hide the card as the first steps hide: at once,
// with "ביטול" in its place and the focus on it; "ביטול" brings it back
// with the focus on the button pressed. The twin keeps nothing, and its
// Today stays as the app's does, the file's quiet row too.
test("the Today demo tells of a bank change, hides it with a way back, and 'לא שיניתי' marks it", async ({
  page,
}) => {
  const b = he.app.home.file.bank;
  await page.goto("/design/shell/today/worker?file=bank");
  await page.waitForLoadState("networkidle");
  const main = page.getByRole("main");
  const card = main.getByRole("region", { name: b.title });
  await expect(card).toBeVisible();
  const undo = page
    .getByRole("status")
    .filter({ hasText: b.hidden })
    .getByRole("button", { name: he.app.manage.undo });
  const mine = card.getByRole("button", { name: b.mine });
  await mine.click();
  await expect(card).toHaveCount(0);
  await expect(undo).toBeFocused();
  await expectCleanPage(page);
  await undo.click();
  await expect(card).toBeVisible();
  await expect(mine).toBeFocused();
  await expect(main.getByText(he.app.home.file.complete)).toBeVisible();

  await card.getByRole("button", { name: b.dispute }).click();
  await expect(page).toHaveURL(/file=disputed/);
  const disputed = main.getByRole("region", { name: b.disputedTitle });
  await expect(
    disputed.getByText(
      heT("app.home.file.bank.disputed", { business: "מסעדת הדגמה" }),
    ),
  ).toBeVisible();
  // The button pressed went: the card's title has the focus.
  await expect(
    disputed.getByRole("heading", { name: b.disputedTitle }),
  ).toBeFocused();
  const seen = disputed.getByRole("button", { name: b.seen });
  await seen.click();
  await expect(disputed).toHaveCount(0);
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(seen).toBeFocused();
  await expectCleanPage(page);

  // Nothing left to tell: the file's quiet row says it is complete, and
  // leads to the file's twin with everything in.
  await page.goto("/design/shell/today/worker?file=complete");
  await page.waitForLoadState("networkidle");
  await expect(main.getByRole("region", { name: b.title })).toHaveCount(0);
  await expect(main.getByText(he.app.home.file.complete)).toBeVisible();
  await expect(
    main.getByRole("link").filter({ hasText: he.app.home.file.complete }),
  ).toHaveAttribute("href", "/design/shell/me/file?state=done");
});

test("the settings demo types the link and the phone left to right", async ({
  page,
}) => {
  const s = he.modules.employee_files.settings;
  await page.goto("/design/shell/manage/employee_files");
  await page.waitForLoadState("networkidle");
  for (const [label, mode] of [
    [s.form101Link.label, "url"],
    [s.employerPhone.label, "tel"],
    [s.deductionsFile.label, "numeric"],
  ] as const) {
    const field = page.getByLabel(new RegExp(label));
    await expect(field).toHaveAttribute("dir", "ltr");
    await expect(field).toHaveAttribute("inputmode", mode);
  }
  // The stored phone reads as people write it.
  await expect(page.getByLabel(new RegExp(s.employerPhone.label))).toHaveValue(
    "03-123-4567",
  );
  await expectCleanPage(page);

  // The management page, drawn as the owner, leads here: every one of the
  // file's settings is an owner's.
  await page.goto("/design/shell/manage");
  await page.waitForLoadState("networkidle");
  await expect(
    page
      .getByRole("link", { name: new RegExp(he.modules.employee_files.name) })
      .filter({ visible: true })
      .first(),
  ).toHaveAttribute("href", "/design/shell/manage/employee_files");
  // A manager's has no such row.
  await page.goto("/design/shell/manage?state=noTeam");
  await page.waitForLoadState("networkidle");
  await expect(
    page
      .getByRole("link", { name: new RegExp(he.modules.employee_files.name) })
      .filter({ visible: true }),
  ).toHaveCount(0);
});

test("the activity demo says the file's settings, the phone left to right", async ({
  page,
}) => {
  const a = he.app.manage.activity;
  await page.goto("/design/shell/manage/activity");
  await page.waitForLoadState("networkidle");
  const what = heT("app.manage.activity.actions.module.settings", {
    module: he.modules.employee_files.name,
  });
  // The owner's log leads to the file's settings.
  await expect(
    page.getByRole("link", { name: what }).filter({ visible: true }).first(),
  ).toHaveAttribute("href", "/design/shell/manage/employee_files");
  await expect(
    page
      .locator('span[dir="ltr"]')
      .filter({ hasText: /^03-123-4567$/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("משרד רואי החשבון").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(a.notSet).filter({ visible: true }).first(),
  ).toBeVisible();
  // Never the E.164 the database keeps.
  await expect(
    page.getByText("+97231234567").filter({ visible: true }),
  ).toHaveCount(0);
});

// A former worker's old file on its twin (profile H5c): read-only, outside
// the app's frame, a number shown on its press and hidden again.
test("the old file's twin shows a number and hides it", async ({ page }) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/screens/past-file");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: heT("app.file.title", { business: "בית הקפה של נועה" }),
    }),
  ).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText("•••0018")).toBeVisible();
  await expect(main.getByText("000000018")).toHaveCount(0);
  // The ID's comes first, on every width.
  await main
    .getByRole("button", { name: f.masked.show, exact: true })
    .first()
    .click();
  await expect(main.getByText("000000018")).toBeVisible();
  await main.getByRole("button", { name: f.masked.hide, exact: true }).click();
  await expect(main.getByText("•••0018")).toBeVisible();
  await expect(main.getByText("000000018")).toHaveCount(0);
});

// With a passport, the twin's "הצגה" shows the passport its last digits are
// from, which are not the account's.
test("the old file's twin shows a passport by its own number", async ({
  page,
}) => {
  const f = he.app.file;
  await openFileDemo(page, "/design/screens/past-file?state=passport");
  const main = page.getByRole("main");
  await expect(main.getByText("•••2468")).toBeVisible();
  await expect(main.getByText("•••0001")).toBeVisible();
  await main
    .getByRole("button", { name: f.masked.show, exact: true })
    .first()
    .click();
  await expect(main.getByText("P0002468")).toBeVisible();
  await expect(main.getByText("000000018")).toHaveCount(0);
});

test("the profile's previous job leads to the old file", async ({ page }) => {
  const business = "בית הקפה של נועה";
  await openFileDemo(page, "/design/shell/me?past=1");
  await expect(
    page.getByRole("heading", { level: 2, name: he.app.past.section }),
  ).toBeVisible();
  await page
    .getByRole("link", {
      name: new RegExp(`^${heT("app.me.file.title", { business })}`),
    })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/design\/screens\/past-file$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: heT("app.file.title", { business }),
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: he.app.file.back, exact: true }).click();
  await expect(page).toHaveURL(/\/design\/shell\/me\?past=1$/);
});

// What a holder does in the file, on its twins (profile H6b-1): an account
// changed again meanwhile is said, then confirmed; a missing part marked
// handed directly, with "ביטול" focused and its undo; the owner's Today
// listing the accounts to look at, each leading to its file's twin. And
// (H6b-2) the team twin's filter. The twins keep nothing.
test("the file twin's account changed meanwhile is said, then confirmed", async ({
  page,
}) => {
  await openFileDemo(page, "/design/shell/team/noa/file?state=moved");
  const bank = page.getByRole("region", { name: hf.sections.bank });
  const confirm = bank.getByRole("button", { name: hf.review.confirmNew });
  await confirm.click();
  await expect(bank.getByRole("alert")).toHaveText(hf.review.moved);
  await expect(page).toHaveURL(
    /\/design\/shell\/team\/noa\/file\?state=review-new$/,
  );
  await expect(bank.getByRole("alert")).toBeFocused();
  await page.waitForLoadState("networkidle");
  await confirm.click();
  await expect(page).toHaveURL(/\/design\/shell\/team\/noa\/file\?state=open$/);
  await expect(
    page.getByText(heT("app.team.file.review.confirmed", { first: "נועה" })),
  ).toBeVisible();
  await expect(confirm).toHaveCount(0);
});

test("the file twin marks a missing part handed directly, with its undo", async ({
  page,
}) => {
  await openFileDemo(page, "/design/shell/team/yoav/file?state=open");
  const bank = page.getByRole("region", { name: hf.sections.bank });
  await bank.getByRole("button", { name: hf.direct.mark }).click();
  await expect(page).toHaveURL(
    /\/design\/shell\/team\/yoav\/file\?state=open&direct=bank$/,
  );
  const undo = page.getByRole("button", { name: hf.direct.undo });
  await expect(undo).toBeFocused();
  await expect(bank.getByText(hf.rows.direct, { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    /\/design\/shell\/team\/yoav\/file\?state=open&direct=$/,
  );
  await expect(bank.getByText(hf.rows.missing, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: hf.sections.bank }),
  ).toBeFocused();
});

test("the owner's Today twin lists the accounts to look at", async ({
  page,
}) => {
  await openFileDemo(page, "/design/shell/today/owner?files=reviews");
  const reviews = page.getByRole("region", {
    name: heT("app.home.fileReviews.title", { count: 2 }),
  });
  const rows = reviews.getByRole("link");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("איתי מזרחי");
  await expect(rows.first()).toContainText(
    heT("app.home.fileReviews.disputed", { form: "m" }),
  );
  await expect(rows.first()).toHaveAttribute(
    "href",
    "/design/shell/team/itay/file",
  );
  await expect(rows.nth(1)).toHaveAttribute(
    "href",
    "/design/shell/team/maya/file",
  );
  await expect(rows.nth(1)).toContainText(he.app.home.fileReviews.new);
});

test("the team twin filters to missing details", async ({ page }) => {
  await openFileDemo(page, "/design/shell/team?file=holder");
  const yoav = page
    .getByRole("link", { name: /יואב לוי/ })
    .filter({ visible: true });
  const noa = page
    .getByRole("link", { name: /נועה כהן/ })
    .filter({ visible: true });
  await expect(noa.first()).toBeVisible();
  await page
    .getByRole("button", { name: hf.filter.missing, exact: true })
    .click();
  await expect(yoav.first()).toBeVisible();
  await expect(noa).toHaveCount(0);
  await page.getByRole("button", { name: hf.filter.all, exact: true }).click();
  await expect(noa.first()).toBeVisible();
});

// The review: a choice that shows nobody says so, and its button leads back
// to everyone. Every file is complete with its 101 accepted (?complete=1).
test("the team twin says a choice shows nobody, and shows everyone again", async ({
  page,
}) => {
  await openFileDemo(page, "/design/shell/team?file=holder&complete=1");
  const noa = page
    .getByRole("link", { name: /נועה כהן/ })
    .filter({ visible: true });
  const choice = (label: string) =>
    page.getByRole("button", { name: label, exact: true });
  const noForm101 = page.getByText(
    heT("app.team.file.filter.emptyForm101", { year: 2026 }),
    { exact: true },
  );
  await expect(noa.first()).toBeVisible();
  await choice(hf.filter.missing).click();
  await expect(
    page.getByText(hf.filter.emptyMissing, { exact: true }),
  ).toBeVisible();
  await expect(noa).toHaveCount(0);
  await expectCleanPage(page);
  await choice(hf.filter.form101).click();
  await expect(noForm101).toBeVisible();
  await choice(hf.filter.showAll).click();
  await expect(noa.first()).toBeVisible();
  await expect(noForm101).toHaveCount(0);
  await expect(choice(hf.filter.all)).toHaveAttribute("aria-pressed", "true");
});

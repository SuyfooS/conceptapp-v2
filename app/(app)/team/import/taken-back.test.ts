import {
  type KnownInvite,
  type KnownTeam,
  knownTeamOf,
} from "@domain/people-import";
import { describe, expect, it } from "vitest";
import { takeBackOf, withoutTakenBack } from "./taken-back";

const invite = (
  id: string,
  phone: string,
  extra: Partial<KnownInvite> = {},
): KnownInvite => ({
  id,
  phone,
  name: `מוזמן ${id}`,
  role: "worker",
  namedRole: null,
  linkPending: true,
  expired: false,
  touchable: true,
  ...extra,
});

const owner = { phone: "+972500007800", name: "נגה בעלים" };
/** The accountant's invite, saved before the import and never part of it. */
const accountant = invite("acc", "+972500007801", { role: "accountant" });
/** What the import made. */
const made = [
  invite("a", "+972500007802"),
  invite("b", "+972500007803"),
  invite("c", "+972500007804"),
];
const takenBack: ReadonlySet<string> = new Set(made.map((one) => one.id));

/** The page's readings of the team: before the import, after it, after its undo. */
const before = knownTeamOf([owner], [accountant]);
const afterImport = knownTeamOf([owner], [accountant, ...made]);
const afterUndo = knownTeamOf([owner], [accountant]);

const phones = (team: KnownTeam) => team.invites.map((one) => one.phone);

describe("withoutTakenBack", () => {
  it("leaves the import's invites out of the reading the import sent, the rest as they were", () => {
    const team = withoutTakenBack(afterImport, takenBack);
    expect(phones(team)).toEqual([accountant.phone]);
    expect(team.members).toEqual(afterImport.members);
    expect(team.waiting).toBe(1);
  });

  it("reads the same whether the page still has the reading from before the import, or gets the import's, or the undo's", () => {
    // The import's refresh can arrive after the press that takes it back:
    // whichever reading is drawn then, its lines read as new.
    const readings = [before, afterImport, afterUndo].map((known) =>
      withoutTakenBack(known, takenBack),
    );
    for (const team of readings) {
      expect(phones(team)).toEqual([accountant.phone]);
      expect(team.waiting).toBe(1);
    }
  });

  it("keeps an invite of the import that got a link meanwhile, as the undo keeps it", () => {
    const linked = invite("a", "+972500007802", { linkPending: false });
    const known = knownTeamOf([owner], [accountant, linked, ...made.slice(1)]);
    const team = withoutTakenBack(known, takenBack);
    expect(phones(team)).toEqual([accountant.phone, linked.phone]);
    expect(team.waiting).toBe(2);
  });

  it("never leaves out an invite the import didn't make, with no link or not", () => {
    const other = invite("other", "+972500007809");
    const known = knownTeamOf([owner], [accountant, other, ...made]);
    expect(phones(withoutTakenBack(known, takenBack))).toEqual([
      accountant.phone,
      other.phone,
    ]);
  });

  it("is the team as read when nothing is taken back", () => {
    expect(withoutTakenBack(afterImport, null)).toBe(afterImport);
    expect(withoutTakenBack(afterImport, new Set())).toBe(afterImport);
  });
});

describe("takeBackOf", () => {
  const ids = made.map((one) => one.id);
  /** The numbers the import invited. */
  const phones = made.map((one) => one.phone);
  const none = () => false;

  it("cancels every invite the import made while none has a link, whichever reading the page has", () => {
    for (const known of [before, afterImport]) {
      expect(takeBackOf(ids, known, none)).toEqual({
        cancels: ["a", "b", "c"],
        kept: 0,
      });
    }
  });

  it("keeps one whose link was made on the screen, before the page reads the team again", () => {
    // "יצירת קישור" for the first, then "מחיקת ההזמנות מהרשימה": the undo
    // cancels two, never "3 הזמנות נמחקו", and only those two are hidden.
    const here = new Set(["a"]);
    for (const known of [before, afterImport]) {
      expect(takeBackOf(ids, known, (id) => here.has(id))).toEqual({
        cancels: ["b", "c"],
        kept: 1,
      });
    }
  });

  it("keeps one the page reads with its link made, here or elsewhere", () => {
    const linked = invite("b", "+972500007803", { linkPending: false });
    const known = knownTeamOf(
      [owner],
      [accountant, ...made.map((one) => (one.id === linked.id ? linked : one))],
    );
    expect(takeBackOf(ids, known, none)).toEqual({
      cancels: ["a", "c"],
      kept: 1,
    });
  });

  it("cancels none once each has its link, so nothing is left to take back", () => {
    const all = new Set(ids);
    expect(takeBackOf(ids, afterImport, (id) => all.has(id))).toEqual({
      cancels: [],
      kept: 3,
    });
  });

  it("counts only the import's own invites", () => {
    expect(takeBackOf([], afterImport, none)).toEqual({
      cancels: [],
      kept: 0,
    });
    // The accountant's invite, waiting with no link, was never the import's.
    expect(takeBackOf(["a"], afterImport, none)).toEqual({
      cancels: ["a"],
      kept: 0,
    });
  });

  it("counts an invite a reading from after the import no longer holds as neither cancelled nor kept", () => {
    // The page reads a and c, so the reading is from after the import: b
    // is gone (claimed, or deleted on the Team screen), and the undo
    // cancels nothing of it.
    const known = knownTeamOf(
      [owner],
      [accountant, ...made.filter((one) => one.id !== "b")],
    );
    expect(takeBackOf(ids, known, none)).toEqual({
      cancels: ["a", "c"],
      kept: 0,
    });
  });

  it("says what the undo does when one joined elsewhere and one got its link here", () => {
    // Another manager made a's link on their own phone and a joined; b's
    // link was made on this screen and the page read the team again: the
    // undo cancels c alone and keeps b, never "2 הזמנות נמחקו".
    const known = knownTeamOf(
      [owner, { phone: "+972500007802", name: "מוזמן a" }],
      [
        accountant,
        ...made
          .filter((one) => one.id !== "a")
          .map((one) =>
            one.id === "b" ? { ...one, linkPending: false } : one,
          ),
      ],
    );
    const here = new Set(["b"]);
    expect(takeBackOf(ids, known, (id) => here.has(id), phones)).toEqual({
      cancels: ["c"],
      kept: 1,
    });
  });

  it("offers nothing to take back once everyone it invited has joined", () => {
    // None of its invites is read any more, as before the import, but its
    // numbers are on the team now: the reading is from after it.
    const known = knownTeamOf(
      [owner, ...made.map((one) => ({ phone: one.phone, name: one.name }))],
      [accountant],
    );
    expect(takeBackOf(ids, known, none, phones)).toEqual({
      cancels: [],
      kept: 0,
    });
    // The reading from before the import, with the same numbers: each waits.
    expect(takeBackOf(ids, before, none, phones)).toEqual({
      cancels: ["a", "b", "c"],
      kept: 0,
    });
  });
});

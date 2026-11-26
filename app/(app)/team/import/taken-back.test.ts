import {
  type KnownInvite,
  type KnownTeam,
  knownTeamOf,
} from "@domain/people-import";
import { describe, expect, it } from "vitest";
import { withoutTakenBack } from "./taken-back";

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

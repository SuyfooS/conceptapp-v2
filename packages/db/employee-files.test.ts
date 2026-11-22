import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The hiring file's server code (profile H4) with the database stood in for:
 * each call kept and answered as the test says, the data key echoed back as
 * the database keeps the first one offered. What is sealed opens again with
 * the run's own key (tooling/vitest-setup.ts), and nothing sent or logged
 * holds a value in the clear.
 */
type Failure = {
  code?: string;
  hint?: string | null;
  message: string;
  details?: string | null;
};
type Call = {
  fn: string;
  args: Record<string, unknown>;
  as: "session" | "admin";
};
type Answer = (args: Record<string, unknown>) => {
  data: unknown;
  error: Failure | null;
};

const db = vi.hoisted(() => ({
  calls: [] as Call[],
  answers: {} as Record<string, Answer>,
}));

const rpcAs = (as: Call["as"]) => ({
  rpc: async (fn: string, args: Record<string, unknown> = {}) => {
    db.calls.push({ fn, args, as });
    const answer = db.answers[fn];
    return answer ? answer(args) : { data: null, error: null };
  },
});

vi.mock("./supabase/server", () => ({
  createClient: async () => rpcAs("session"),
}));
vi.mock("./supabase/admin", () => ({
  createAdminClient: () => rpcAs("admin"),
}));

const crypto = await import("./crypto");
const files = await import("./employee-files");

const BUSINESS = "f1000000-0000-4000-b000-000000000001";
const NOA = "f1000000-0000-4000-a000-000000000003";
const OWNER = "f1000000-0000-4000-a000-000000000001";
const TODAY = "2026-11-26";

/** The data key the database keeps: the first one offered, echoed back. */
const echoKey: Answer = (args) => ({
  data: { kek_id: args.offered_kek, wrapped_dek: args.offered_dek },
  error: null,
});

const callsTo = (fn: string) => db.calls.filter((call) => call.fn === fn);

/** The person's data key, from what the write offered. */
function dekOf(call: Call | undefined): Buffer {
  const ring = crypto.employeeKeyRing();
  if (!ring || !call) throw new Error("no key");
  return crypto.unwrapDataKey(
    ring,
    call.args.offered_kek as number,
    crypto.fromBase64(call.args.offered_dek as string),
    call.args.business as string,
    call.args.person as string,
  );
}

const placeOf = (column: Parameters<typeof crypto.seal>[2]["column"]) => ({
  table: "employee_details" as const,
  column,
  business: BUSINESS,
  user: NOA,
});

beforeEach(() => {
  db.calls = [];
  db.answers = {
    employee_data_key: echoKey,
    set_employee_details: () => ({
      data: { changed: ["identity"], change_due_by: null },
      error: null,
    }),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("without the keys", () => {
  const saved = {
    keks: process.env.EMPLOYEE_DATA_KEKS,
    active: process.env.EMPLOYEE_DATA_KEK_ACTIVE,
  };
  beforeEach(() => {
    delete process.env.EMPLOYEE_DATA_KEKS;
    delete process.env.EMPLOYEE_DATA_KEK_ACTIVE;
  });
  afterEach(() => {
    process.env.EMPLOYEE_DATA_KEKS = saved.keks ?? "";
    process.env.EMPLOYEE_DATA_KEK_ACTIVE = saved.active ?? "";
  });

  it("every read and write of a file says so before it reaches the database", async () => {
    expect(await files.getEmployeeFile(BUSINESS, NOA)).toEqual({
      ok: false,
      failure: "keys",
    });
    expect(
      await files.revealEmployeeFields(BUSINESS, NOA, ["id"]),
    ).toMatchObject({ failure: "keys" });
    expect(await files.exportEmployeeFiles(BUSINESS, "own")).toMatchObject({
      failure: "keys",
    });
    expect(await files.getTeamEmergencyContacts(BUSINESS)).toMatchObject({
      failure: "keys",
    });
    expect(
      await files.saveEmployeeDetails(
        NOA,
        BUSINESS,
        NOA,
        { names: { first: "נועה", last: "כהן" } },
        TODAY,
      ),
    ).toEqual({ ok: false, failure: "keys" });
    expect(await files.saveEmergencyContact(NOA, BUSINESS, null)).toMatchObject(
      { failure: "keys" },
    );
    expect(await files.submitEmployeeFile(NOA, BUSINESS)).toMatchObject({
      failure: "keys",
    });
    expect(db.calls).toEqual([]);
  });

  it("but the completeness status still reads", async () => {
    db.answers.employee_file_status = () => ({
      data: [
        {
          user_id: NOA,
          complete: false,
          missing: 2,
          form101_in: true,
          detail: null,
        },
      ],
      error: null,
    });
    const status = await files.getEmployeeFileStatus(BUSINESS);
    expect(status.get(NOA)).toMatchObject({ missing: 2, form101_in: true });
  });
});

describe("saveEmployeeDetails", () => {
  it("sends only the groups given, each sealed group in base64 with its hint, and no value in the clear", async () => {
    const result = await files.saveEmployeeDetails(
      OWNER,
      BUSINESS,
      NOA,
      {
        names: { first: " נועה ", last: "כהן" },
        identity: { kind: "il", number: "18" },
      },
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      changed: ["identity"],
      changeDueBy: null,
    });
    const [save] = callsTo("set_employee_details");
    expect(save?.as).toBe("admin");
    expect(save?.args).toMatchObject({
      actor: OWNER,
      business: BUSINESS,
      person: NOA,
    });
    const patch = save?.args.patch as Record<string, Record<string, string>>;
    expect(Object.keys(patch).sort()).toEqual(["identity", "names"]);
    expect(patch.names).toEqual({ first: "נועה", last: "כהן" });
    expect(patch.identity?.kind).toBe("il");
    expect(patch.identity?.hint).toBe("0018");
    expect(patch.identity?.sealed).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(JSON.stringify(patch)).not.toContain("000000018");
    // It opens again as the number, in its place only.
    const dek = dekOf(callsTo("employee_data_key")[0]);
    expect(
      crypto.open(
        dek,
        crypto.fromBase64(patch.identity?.sealed ?? ""),
        placeOf("id_enc"),
        { demo: false },
      ),
    ).toBe("000000018");
    // A holder's write never reads the person's file first.
    expect(callsTo("employee_file")).toEqual([]);
  });

  it("seals nothing, and makes no key, for plain groups only", async () => {
    await files.saveEmployeeDetails(
      NOA,
      BUSINESS,
      NOA,
      {
        birthDate: { day: "4", month: "2", year: "2009" },
        pension: { answer: "existing", fund: "unknown" },
      },
      TODAY,
    );
    expect(callsTo("employee_data_key")).toEqual([]);
    expect(callsTo("set_employee_details")[0]?.args.patch).toEqual({
      birth_date: "2009-02-04",
      pension: { answer: "existing", fund: "unknown" },
    });
  });

  it("sends an account with its check, a warning to wait for a holder", async () => {
    await files.saveEmployeeDetails(
      NOA,
      BUSINESS,
      NOA,
      {
        bank: {
          bank: 12,
          branch: 600,
          account: "100002",
          holder: "family",
          holderName: "דוד כהן",
          instruction: "v1",
        },
      },
      TODAY,
    );
    const patch = callsTo("set_employee_details")[0]?.args.patch as {
      bank: Record<string, unknown>;
    };
    expect(patch.bank).toMatchObject({
      code: 12,
      branch: 600,
      hint: "0002",
      holder: "family",
      instruction: "v1",
      check: "warning",
    });
    expect(JSON.stringify(patch)).not.toMatch(/100002|דוד/);
    const dek = dekOf(callsTo("employee_data_key")[0]);
    expect(
      crypto.open(
        dek,
        crypto.fromBase64(patch.bank.holder_sealed as string),
        placeOf("bank_holder_enc"),
        { demo: false },
      ),
    ).toBe("דוד כהן");
  });

  it("refuses what doesn't check before any call, and never says what it was", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const input of [
      { identity: { kind: "il", number: "000000019" } },
      {
        bank: {
          bank: 12,
          branch: 600,
          account: "12a",
          holder: "self",
          instruction: "v1",
        },
      },
      { religion: "x" },
    ]) {
      expect(
        await files.saveEmployeeDetails(NOA, BUSINESS, NOA, input, TODAY),
      ).toEqual({ ok: false, failure: "invalid" });
    }
    expect(db.calls).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("leaves out of the person's own write a sealed group typed as stored", async () => {
    // Noa's file holds this address already, sealed with her key.
    const ring = crypto.employeeKeyRing();
    if (!ring) throw new Error("no ring");
    const dek = crypto.newDataKey();
    const wrapped = crypto.wrapDataKey(ring, dek, BUSINESS, NOA);
    const address = {
      kind: "street" as const,
      cityCode: 5000,
      street: "הרצל",
      number: "12",
    };
    const { addressText } = await import("@domain/employee-file");
    db.answers.employee_data_key = () => ({
      data: {
        kek_id: wrapped.kekId,
        wrapped_dek: crypto.toBase64(wrapped.wrapped),
      },
      error: null,
    });
    db.answers.employee_file = () => ({
      data: {
        access: "self",
        demo: false,
        file: storedFile({ city_code: 5000 }),
        sealed: {
          address: crypto.toBase64(
            crypto.seal(dek, addressText(address), placeOf("address_enc")),
          ),
          email: null,
          work_language: null,
          id_name: null,
          bank_holder: null,
          emergency: null,
        },
        key: {
          kek_id: wrapped.kekId,
          wrapped_dek: crypto.toBase64(wrapped.wrapped),
        },
        missing: [],
        youth_until: null,
        pension_due_on: null,
        tax_years: [],
      },
      error: null,
    });
    await files.saveEmployeeDetails(
      NOA,
      BUSINESS,
      NOA,
      { address, email: "noa@example.com" },
      TODAY,
    );
    const patch = callsTo("set_employee_details")[0]?.args.patch as object;
    expect(Object.keys(patch)).toEqual(["email"]);
    expect(callsTo("employee_file")[0]?.as).toBe("session");
  });

  it("reads the database's refusals by their code and hint", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const cases: [Failure, string][] = [
      [
        {
          code: "42501",
          hint: "own",
          message: "The person changes this themselves",
        },
        "own",
      ],
      [
        { code: "55000", hint: "step_up", message: "A fresh code first" },
        "stepUp",
      ],
      [
        { code: "55000", hint: "phone_hold", message: "Bank details wait" },
        "phoneHold",
      ],
      [
        {
          code: "55000",
          hint: "not_open",
          message: "Real files are not open yet",
        },
        "closed",
      ],
      [{ code: "42883", message: "no such function" }, "unavailable"],
      [{ code: "XX000", message: "Something broke" }, "failed"],
    ];
    for (const [error, failure] of cases) {
      db.answers.set_employee_details = () => ({ data: null, error });
      expect(
        await files.saveEmployeeDetails(
          NOA,
          BUSINESS,
          NOA,
          { pension: { answer: "later" } },
          TODAY,
        ),
      ).toEqual({ ok: false, failure });
    }
    // Only the unexpected one is logged: its code and the database's words.
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toEqual([
      "saving a file failed",
      "XX000",
      "Something broke",
    ]);
  });

  it("says the day a bank change opens again after a phone change, a date only", async () => {
    const hold = (details: string | null): Failure => ({
      code: "55000",
      hint: "phone_hold",
      message: "Bank details wait a week after a phone change",
      details,
    });
    const saveBank = () =>
      files.saveEmployeeDetails(
        NOA,
        BUSINESS,
        NOA,
        {
          bank: {
            bank: 12,
            branch: 600,
            account: "100001",
            holder: "self",
            instruction: "v1",
          },
        },
        TODAY,
      );
    db.answers.set_employee_details = () => ({
      data: null,
      error: hold("2026-11-30"),
    });
    expect(await saveBank()).toEqual({
      ok: false,
      failure: "phoneHold",
      opensOn: "2026-11-30",
    });
    // Anything else a DETAIL might hold never comes up.
    for (const details of ["100001", "2026-11-30 and more", null]) {
      db.answers.set_employee_details = () => ({
        data: null,
        error: hold(details),
      });
      expect(await saveBank()).toEqual({ ok: false, failure: "phoneHold" });
    }
    // Another refusal's DETAIL is no day.
    db.answers.set_employee_details = () => ({
      data: null,
      error: {
        code: "55000",
        hint: "step_up",
        message: "A fresh code first",
        details: "2026-11-30",
      },
    });
    expect(await saveBank()).toEqual({ ok: false, failure: "stepUp" });
  });

  it("fails closed on a reply that doesn't parse", async () => {
    db.answers.set_employee_details = () => ({
      data: { changed: ["religion"] },
      error: null,
    });
    expect(
      await files.saveEmployeeDetails(
        NOA,
        BUSINESS,
        NOA,
        { pension: { answer: "later" } },
        TODAY,
      ),
    ).toEqual({ ok: false, failure: "failed" });
  });
});

/** A file's plain part as the database answers it, with what a test sets. */
function storedFile(over: Record<string, unknown> = {}) {
  return {
    legal_first_name: "נועה",
    legal_last_name: "כהן",
    birth_date: null,
    id_kind: null,
    id_country: null,
    id_expires_on: null,
    id_hint: null,
    city_code: null,
    bank_code: null,
    bank_branch: null,
    bank_account_hint: null,
    bank_holder_kind: null,
    bank_instruction_at: null,
    bank_instruction_version: null,
    bank_changed_at: null,
    bank_review: null,
    pension_answer: null,
    pension_fund: null,
    pension_answered_at: null,
    direct_groups: [],
    submitted_at: null,
    updated_at: "2026-11-20T10:00:00+00:00",
    has: {
      id: false,
      address: over.city_code !== undefined,
      email: false,
      work_language: false,
      bank_account: false,
    },
    ...over,
  };
}

describe("getEmployeeFile", () => {
  it("opens the sealed values, and shows the numbers by their last digits only", async () => {
    const ring = crypto.employeeKeyRing();
    if (!ring) throw new Error("no ring");
    const dek = crypto.newDataKey();
    const wrapped = crypto.wrapDataKey(ring, dek, BUSINESS, NOA);
    db.answers.employee_file = () => ({
      data: {
        access: "holder",
        demo: false,
        file: storedFile({
          id_kind: "il",
          id_hint: "0018",
          bank_account_hint: "0001",
        }),
        sealed: {
          address: null,
          email: crypto.toBase64(
            crypto.seal(dek, "noa@example.com", placeOf("email_enc")),
          ),
          work_language: null,
          id_name: null,
          bank_holder: null,
          emergency: crypto.toBase64(
            crypto.seal(dek, '{"name":"דוד","phone":"+972501234567"}', {
              table: "member_emergency_contacts",
              column: "contact_enc",
              business: BUSINESS,
              user: NOA,
            }),
          ),
        },
        key: {
          kek_id: wrapped.kekId,
          wrapped_dek: crypto.toBase64(wrapped.wrapped),
        },
        missing: ["address", "bank"],
        youth_until: null,
        pension_due_on: null,
        tax_years: [],
      },
      error: null,
    });
    const file = await files.getEmployeeFile(BUSINESS, NOA);
    expect(file).toMatchObject({
      ok: true,
      access: "holder",
      email: "noa@example.com",
      emergency: { name: "דוד", phone: "+972501234567" },
      masked: { id: "•••0018", bankAccount: "•••0001" },
      missing: ["address", "bank"],
    });
    expect(callsTo("employee_file")[0]?.as).toBe("session");
  });

  it("reads a demo's made-up values without a key", async () => {
    const demo = (text: string) =>
      Buffer.concat([Buffer.from([0]), Buffer.from(text, "utf8")]).toString(
        "base64",
      );
    db.answers.employee_file = () => ({
      data: {
        access: "self",
        demo: true,
        file: storedFile(),
        sealed: {
          address: null,
          email: demo("3@demo.conceptapp.invalid"),
          work_language: null,
          id_name: null,
          bank_holder: null,
          emergency: null,
        },
        key: null,
        missing: [],
        youth_until: null,
        pension_due_on: null,
        tax_years: [],
      },
      error: null,
    });
    expect(await files.getEmployeeFile(BUSINESS, NOA)).toMatchObject({
      email: "3@demo.conceptapp.invalid",
    });
  });

  it("says why not, and fails closed on what it can't read or open", async () => {
    db.answers.employee_file = () => ({
      data: { access: "denied", reason: "not_holder" },
      error: null,
    });
    expect(await files.getEmployeeFile(BUSINESS, NOA)).toEqual({
      ok: false,
      failure: "denied",
      reason: "not_holder",
    });
    db.answers.employee_file = () => ({
      data: { access: "maybe" },
      error: null,
    });
    expect(await files.getEmployeeFile(BUSINESS, NOA)).toEqual({
      ok: false,
      failure: "failed",
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.answers.employee_file = () => ({
      data: {
        access: "self",
        demo: false,
        file: storedFile(),
        // Sealed for someone else's key: it doesn't open.
        sealed: {
          address: null,
          email: crypto.toBase64(
            crypto.seal(crypto.newDataKey(), "x@y.z", placeOf("email_enc")),
          ),
          work_language: null,
          id_name: null,
          bank_holder: null,
          emergency: null,
        },
        key: null,
        missing: [],
        youth_until: null,
        pension_due_on: null,
        tax_years: [],
      },
      error: null,
    });
    expect(await files.getEmployeeFile(BUSINESS, NOA)).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("x@y.z");
  });
});

describe("the other writes", () => {
  it("seal the contact with the person's own key", async () => {
    db.answers.set_emergency_contact = () => ({ data: null, error: null });
    expect(
      await files.saveEmergencyContact(NOA, BUSINESS, {
        name: "דוד כהן",
        phone: "050-123-4567",
      }),
    ).toEqual({ ok: true });
    const [key] = callsTo("employee_data_key");
    expect(key?.args.person).toBe(NOA);
    const sealed = callsTo("set_emergency_contact")[0]?.args.sealed_contact;
    expect(String(sealed)).not.toMatch(/דוד|0501234567/);
    expect(
      crypto.open(
        dekOf(key),
        crypto.fromBase64(String(sealed)),
        {
          table: "member_emergency_contacts",
          column: "contact_enc",
          business: BUSINESS,
          user: NOA,
        },
        { demo: false },
      ),
    ).toBe('{"name":"דוד כהן","phone":"+972501234567"}');
  });

  it("remove the contact with no key and nothing sealed", async () => {
    await files.saveEmergencyContact(NOA, BUSINESS, null);
    expect(callsTo("employee_data_key")).toEqual([]);
    expect(callsTo("set_emergency_contact")[0]?.args).toEqual({
      actor: NOA,
      business: BUSINESS,
    });
  });

  it("send a year's 101 mark, leaving out what isn't given", async () => {
    await files.setTaxYearStatus(OWNER, BUSINESS, NOA, {
      year: 2026,
      status: "returned",
      reason: "signature",
    });
    await files.setTaxYearStatus(OWNER, BUSINESS, NOA, {
      year: 2026,
      status: null,
    });
    expect(callsTo("set_tax_year_status").map((call) => call.args)).toEqual([
      {
        actor: OWNER,
        business: BUSINESS,
        person: NOA,
        for_year: 2026,
        new_status: "returned",
        why: "signature",
      },
      { actor: OWNER, business: BUSINESS, person: NOA, for_year: 2026 },
    ]);
  });

  it("read a stale confirmation as changed meanwhile", async () => {
    db.answers.acknowledge_bank = () => ({
      data: null,
      error: {
        code: "40001",
        message: "The account changed since it was read",
      },
    });
    expect(
      await files.acknowledgeBank(OWNER, BUSINESS, NOA, "2026-11-20T10:00:00Z"),
    ).toEqual({ ok: false, failure: "moved" });
  });
});

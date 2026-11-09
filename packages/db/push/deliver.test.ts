import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { deliverWith } = await import("./deliver");
type Deps = Parameters<typeof deliverWith>[0];
type Due = Awaited<ReturnType<Deps["claim"]>>[number];

const NOW = Date.parse("2026-11-09T10:00:00Z");

const due = (
  delivery: string,
  device: string,
  validUntil: string | null = null,
): Due => ({
  delivery,
  notification: `n-${delivery}`,
  kind: "swap.offered",
  validUntil,
  device,
  endpoint: `https://fcm.googleapis.com/fcm/send/${device}`,
});

/** Claims that give these batches in turn, then nothing. */
function fake(
  batches: Due[][],
  answer: (endpoint: string) => Awaited<ReturnType<Deps["send"]>>,
) {
  const claims: number[] = [];
  const finished: Parameters<Deps["finish"]>[0][] = [];
  const sent: { endpoint: string; ttl: number }[] = [];
  const deps: Deps = {
    claim: async (rows) => {
      claims.push(rows);
      return batches.shift() ?? [];
    },
    finish: async (outcomes) => {
      finished.push(outcomes);
    },
    send: async (endpoint, ttl) => {
      sent.push({ endpoint, ttl });
      return answer(endpoint);
    },
    now: () => NOW,
  };
  return { deps, claims, finished, sent };
}

describe("deliverWith", () => {
  it("sends each device one push, however many lines wait for it", async () => {
    const run = fake(
      [[due("1", "phone"), due("2", "phone"), due("3", "laptop")]],
      () => ({ outcome: "ok", status: 201 }),
    );
    const summary = await deliverWith(run.deps);
    expect(run.sent.map((s) => s.endpoint).sort()).toEqual([
      "https://fcm.googleapis.com/fcm/send/laptop",
      "https://fcm.googleapis.com/fcm/send/phone",
    ]);
    expect(run.finished).toHaveLength(1);
    expect(
      run.finished[0]?.map((o) => `${o.delivery}:${o.outcome}`).sort(),
    ).toEqual(["1:ok", "2:ok", "3:ok"]);
    expect(summary).toEqual({
      devices: 2,
      ok: 2,
      gone: 0,
      refused: 0,
      retry: 0,
      reasons: {},
    });
  });

  it("says how each device's push went, for each of its lines", async () => {
    const run = fake(
      [
        [
          due("1", "gone"),
          due("2", "busy"),
          due("3", "apple"),
          due("4", "broken"),
        ],
      ],
      (endpoint) => {
        if (endpoint.endsWith("gone")) return { outcome: "gone", status: 410 };
        if (endpoint.endsWith("busy")) {
          return { outcome: "retry", status: 429, wait: 120 };
        }
        if (endpoint.endsWith("apple")) {
          return { outcome: "refused", status: 403, reason: "BadJwtToken" };
        }
        throw new Error("network");
      },
    );
    const summary = await deliverWith(run.deps);
    expect(
      Object.fromEntries((run.finished[0] ?? []).map((o) => [o.delivery, o])),
    ).toEqual({
      "1": { delivery: "1", outcome: "gone" },
      "2": { delivery: "2", outcome: "retry", wait: 120 },
      "3": { delivery: "3", outcome: "refused" },
      "4": { delivery: "4", outcome: "retry" },
    });
    expect(summary).toMatchObject({
      devices: 4,
      gone: 1,
      retry: 2,
      refused: 1,
      reasons: { BadJwtToken: 1 },
    });
  });

  it("keeps a push as long as its lines matter", async () => {
    const run = fake(
      [
        [
          due("1", "phone", "2026-11-09T10:10:00Z"),
          due("2", "phone", "2026-11-09T10:20:00Z"),
          due("3", "laptop"),
        ],
      ],
      () => ({ outcome: "ok", status: 201 }),
    );
    await deliverWith(run.deps);
    const ttl = Object.fromEntries(
      run.sent.map((s) => [s.endpoint.split("/").pop(), s.ttl]),
    );
    expect(ttl).toEqual({ phone: 1200, laptop: 86400 });
  });

  it("claims again while a claim comes back full, a few times at most", async () => {
    const full = () => [due("a", "one"), due("b", "two")];
    const run = fake([full(), full(), [due("c", "three")], full()], () => ({
      outcome: "ok",
      status: 201,
    }));
    await deliverWith(run.deps, { rows: 2 });
    // Two full claims, then one that wasn't: it stops there.
    expect(run.claims).toEqual([2, 2, 2]);
    expect(run.finished).toHaveLength(3);

    const endless = fake(
      Array.from({ length: 20 }, () => full()),
      () => ({ outcome: "ok", status: 201 }),
    );
    await deliverWith(endless.deps, { rows: 2, rounds: 3 });
    expect(endless.claims).toHaveLength(3);
  });

  it("does nothing when nothing is due", async () => {
    const run = fake([], () => ({ outcome: "ok", status: 201 }));
    expect((await deliverWith(run.deps)).devices).toBe(0);
    expect(run.sent).toEqual([]);
    expect(run.finished).toEqual([]);
  });

  it("sends at most eight at once", async () => {
    let flying = 0;
    let most = 0;
    const devices = Array.from({ length: 20 }, (_, i) =>
      due(String(i), `d${i}`),
    );
    const run = fake([devices], () => ({ outcome: "ok", status: 201 }));
    run.deps.send = async () => {
      flying += 1;
      most = Math.max(most, flying);
      await new Promise((resolve) => setTimeout(resolve, 5));
      flying -= 1;
      return { outcome: "ok", status: 201 };
    };
    await deliverWith(run.deps);
    expect(most).toBe(8);
  });
});

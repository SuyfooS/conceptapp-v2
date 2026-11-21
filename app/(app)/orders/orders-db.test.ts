import { describe, expect, it } from "vitest";
import { memoryOrdersDb } from "./orders-db";

// The phone's store in memory (P7), which stands in for IndexedDB where it
// is missing and in the outbox's tests: keyed and indexed as the real one,
// atomic, one run at a time, copied in and out.

const round = (key: string, user: string, business: string) => ({
  key,
  user,
  business,
});

describe("the phone's store in memory", () => {
  it("keys each store as IndexedDB does, and reads by person and business", async () => {
    const db = memoryOrdersDb();
    await db.run(["rounds", "drafts"], "readwrite", (tx) => {
      tx.put("rounds", round("k1", "yoav", "b1"));
      tx.put("rounds", round("k2", "yoav", "b2"));
      tx.put("rounds", round("k3", "noa", "b1"));
      tx.put("drafts", { user: "yoav", business: "b1", draft: "d", lines: [] });
      // The same key again takes its place.
      tx.put("drafts", {
        user: "yoav",
        business: "b1",
        draft: "d",
        lines: [1],
      });
    });
    const read = await db.run(["rounds", "drafts"], "readonly", async (tx) => ({
      one: await tx.get("rounds", "k1"),
      owner: await tx.getAll("rounds", { owner: ["yoav", "b1"] }),
      user: await tx.getAll("rounds", { user: "yoav" }),
      all: await tx.getAll("rounds"),
      draft: await tx.get("drafts", ["yoav", "b1", "d"]),
    }));
    expect(read.one).toEqual(round("k1", "yoav", "b1"));
    expect(read.owner).toEqual([round("k1", "yoav", "b1")]);
    expect(read.user).toHaveLength(2);
    expect(read.all).toHaveLength(3);
    expect(read.draft).toMatchObject({ lines: [1] });
  });

  it("writes nothing of a run that throws or aborts", async () => {
    const db = memoryOrdersDb();
    await db.run(["rounds"], "readwrite", (tx) =>
      tx.put("rounds", round("k1", "yoav", "b1")),
    );
    await expect(
      db.run(["rounds"], "readwrite", (tx) => {
        tx.delete("rounds", "k1");
        tx.put("rounds", round("k2", "yoav", "b1"));
        throw new Error("no");
      }),
    ).rejects.toThrow("no");
    await expect(
      db.run(["rounds"], "readwrite", (tx) => {
        tx.delete("rounds", "k1");
        tx.abort();
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(db.dump("rounds")).toEqual([round("k1", "yoav", "b1")]);
  });

  it("refuses a write in a run that only reads", async () => {
    const db = memoryOrdersDb();
    await expect(
      db.run(["rounds"], "readonly", (tx) =>
        tx.put("rounds", round("k1", "yoav", "b1")),
      ),
    ).rejects.toThrow();
    expect(db.dump("rounds")).toEqual([]);
  });

  it("runs one at a time, in the order they came, and copies what it keeps", async () => {
    const db = memoryOrdersDb();
    const order: string[] = [];
    const kept = round("k1", "yoav", "b1");
    const first = db.run(["rounds"], "readwrite", async (tx) => {
      await tx.get("rounds", "k1");
      await tx.get("rounds", "k1");
      order.push("first");
      tx.put("rounds", kept);
    });
    const second = db.run(["rounds"], "readwrite", async (tx) => {
      order.push(
        `second saw ${(await tx.get("rounds", "k1")) ? "it" : "none"}`,
      );
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second saw it"]);
    kept.user = "changed";
    expect(db.dump("rounds")).toEqual([round("k1", "yoav", "b1")]);
  });
});

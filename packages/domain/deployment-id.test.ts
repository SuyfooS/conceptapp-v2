import { describe, expect, it } from "vitest";
import { deploymentIdOf } from "./deployment-id";

// Which release a build is (closing the pilot, PR 1a): Vercel's id for each
// deployment, Next.js's own first, and none on a local build or CI's.

describe("deploymentIdOf", () => {
  it("is none for a local build and CI's, which set neither", () => {
    expect(deploymentIdOf({})).toBeUndefined();
    expect(
      deploymentIdOf({ NEXT_DEPLOYMENT_ID: "", VERCEL_DEPLOYMENT_ID: "" }),
    ).toBeUndefined();
  });

  it("is Vercel's id for the deployment", () => {
    expect(
      deploymentIdOf({
        VERCEL_DEPLOYMENT_ID: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
      }),
    ).toBe("dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3");
  });

  it("takes Next.js's own first, which a different value would fail the build on Vercel", () => {
    expect(
      deploymentIdOf({
        NEXT_DEPLOYMENT_ID: "dpl_next",
        VERCEL_DEPLOYMENT_ID: "dpl_vercel",
      }),
    ).toBe("dpl_next");
    expect(
      deploymentIdOf({ NEXT_DEPLOYMENT_ID: "", VERCEL_DEPLOYMENT_ID: "dpl_v" }),
    ).toBe("dpl_v");
  });

  it("is none for a value that would break an asset's address", () => {
    for (const value of [
      "dpl 1",
      "dpl&x=1",
      "dpl/1",
      "dpl?1",
      "x".repeat(65),
      "דפל",
    ]) {
      expect(deploymentIdOf({ VERCEL_DEPLOYMENT_ID: value }), value).toBe(
        undefined,
      );
    }
    expect(deploymentIdOf({ VERCEL_DEPLOYMENT_ID: "x".repeat(64) })).toBe(
      "x".repeat(64),
    );
  });
});

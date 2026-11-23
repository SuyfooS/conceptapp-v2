import { type Page, request } from "@playwright/test";

/*
 * Storage asked straight, as someone who copied their own session from the
 * browser's developer tools would (20261127000300_files_server_only.sql): no
 * bucket has a policy, so their token signs nothing, downloads nothing and
 * lists nothing, whatever they read through the app. The address and the
 * publishable key are CI's (NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, from the local stack); without them a
 * test says why it skips.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Why Storage can't be asked here, or null when it can. */
export const STORAGE_SKIP =
  URL_BASE && PUBLISHABLE_KEY
    ? null
    : "needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (CI sets them)";

/**
 * The signed-in person's own access token, from the session's cookie as
 * @supabase/ssr writes it: `sb-<ref>-auth-token`, or its chunks `.0`, `.1`,
 * …, joined in order, then `base64-` and base64url JSON.
 */
export async function accessTokenOf(page: Page): Promise<string> {
  const chunks = (await page.context().cookies())
    .flatMap((cookie) => {
      const match = /^sb-.+-auth-token(?:\.(\d+))?$/.exec(cookie.name);
      return match && cookie.value !== ""
        ? [{ at: Number(match[1] ?? "-1"), value: cookie.value }]
        : [];
    })
    .sort((a, b) => a.at - b.at)
    .map((chunk) => chunk.value);
  const value = chunks.join("");
  const json = value.startsWith("base64-")
    ? Buffer.from(value.slice("base64-".length), "base64url").toString("utf8")
    : value;
  const token = (JSON.parse(json) as { access_token?: unknown }).access_token;
  if (typeof token !== "string" || token === "") {
    throw new Error("No access token in the session's cookie");
  }
  return token;
}

/** What Storage gave the token of one file. */
export type StorageAnswers = {
  /** A signed link good for ten years: its status, and whether one came. */
  sign: { status: number; signed: boolean; body: string };
  /** The file itself, as an authenticated download: its status. */
  download: number;
  /** The file's folder, listed: what came back. */
  list: unknown;
};

/**
 * Storage's three answers to the person's own token for the file at `path`,
 * asked from outside the browser, with nothing else of theirs: a signed link
 * good for ten years, the file itself, and its folder's list.
 */
export async function storageAnswers(
  page: Page,
  bucket: string,
  path: string,
): Promise<StorageAnswers> {
  const token = await accessTokenOf(page);
  const headers = { Authorization: `Bearer ${token}`, apikey: PUBLISHABLE_KEY };
  const base = `${URL_BASE.replace(/\/+$/, "")}/storage/v1/object`;
  const folder = path.split("/").slice(0, -1).join("/");
  const api = await request.newContext();
  try {
    const sign = await api.post(`${base}/sign/${bucket}/${path}`, {
      headers,
      data: { expiresIn: 315_360_000 },
    });
    const signBody = await sign.text();
    const download = await api.get(`${base}/authenticated/${bucket}/${path}`, {
      headers,
    });
    const list = await api.post(`${base}/list/${bucket}`, {
      headers,
      data: { prefix: folder, limit: 100, offset: 0 },
    });
    const listBody = await list.text();
    let listed: unknown = listBody;
    try {
      listed = JSON.parse(listBody);
    } catch {
      // Not JSON: what came back is the answer.
    }
    return {
      sign: {
        status: sign.status(),
        signed: sign.status() === 200 || /signedurl/i.test(signBody),
        body: signBody,
      },
      download: download.status(),
      list: listed,
    };
  } finally {
    await api.dispose();
  }
}

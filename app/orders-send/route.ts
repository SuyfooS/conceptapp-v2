import { sendOrderRound } from "@db/orders";
import { getOwnPlace } from "@db/session";
import { SEND_BODY_MAX, sendBody } from "@domain/orders-sync";
import { sameOriginRequest } from "@/app/origin";
import { SEND_STATUS, type SendFailure } from "./send-status";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function refused(
  failure: SendFailure,
  items: string[] = [],
  order: string | null = null,
  status = SEND_STATUS[failure],
): Response {
  return Response.json(
    { ok: false, failure, items, order },
    { status, headers: NO_STORE },
  );
}

/** A body that isn't a round: never one to try again. */
const notARound = () => refused("invalid", [], null, 400);

/**
 * A round sent from a phone (waiter mode P4): `POST /orders-send` with the
 * round (`sendBody`: its key, where it goes, its lines), the business it
 * was written for and, since P7, the person who wrote it. A route rather than a server action: an action's id
 * changes with each deploy and a forwarded action drops its cookies, while a
 * send has to survive leaving the screen (keepalive) and be tried again with
 * the same key, which the database answers with the same round.
 *
 * The person is the session's, and the body names them: a round kept on a
 * shared phone and sent again after someone else signed in there (the
 * cookie is the browser's, shared by its tabs) is refused (409 `person`)
 * before anything is read, never written as the next person's. The business
 * is the body's, never the cookie's, so a send retried after switching
 * business goes where it was written, once it is one of the person's active
 * memberships (403 `notMember`, which the phone tells apart from a place
 * gone); the database checks that again (unknown: 404) and everything else.
 * Refused from another site (403), for a body that isn't one or is over 64
 * KB (400 `invalid`), signed out (401) and while viewing as someone (403
 * `viewOnly`). Answers `{ok: true, round}`, or
 * the refusal with the items and the order it names, at `SEND_STATUS`'s
 * status. Nothing of the body is logged: notes may say something about a
 * guest's health.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) return refused("noAccess");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > SEND_BODY_MAX) return notARound();

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > SEND_BODY_MAX) return notARound();
    raw = JSON.parse(text);
  } catch {
    return notARound();
  }
  const body = sendBody.safeParse(raw);
  if (!body.success) return notARound();

  try {
    const own = await getOwnPlace();
    if (!own) return refused("signedOut");
    const { business, user, ...round } = body.data;
    if (user.toLowerCase() !== own.userId.toLowerCase()) {
      return refused("person");
    }
    if (own.viewing) return refused("viewOnly");
    if (!own.memberOf.includes(business.toLowerCase())) {
      return refused("notMember");
    }
    const sent = await sendOrderRound(own.userId, business, round);
    if (!sent.ok) return refused(sent.failure, sent.items, sent.order);
    return Response.json(
      { ok: true, round: sent.value },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    console.error("sending a round failed", code);
    return refused("failed");
  }
}

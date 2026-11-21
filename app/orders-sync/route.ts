import { getMenu } from "@db/order-taking";
import {
  getMyOrders,
  getOrderDetail,
  getOrderFloor,
  getOrderPrep,
  type OffShift,
  type OrderRead,
  readOrderReady,
} from "@db/orders";
import { getOwnPlace } from "@db/session";
import type { MyOrders } from "@domain/orders";
import {
  type OrdersSyncAnswer,
  readOrdersSyncQuery,
  syncedVersion,
} from "@domain/orders-sync";
import { sameOriginRequest } from "@/app/origin";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** An answer with no body, never kept anywhere. */
function status(code: 204 | 400 | 401 | 403 | 404 | 500): Response {
  return new Response(null, { status: code, headers: NO_STORE });
}

const isOff = (read: unknown): read is OffShift =>
  typeof read === "object" && read !== null && "off" in read;

/** A read's answer, when it brought one. */
function answered<T>(read: OrderRead<T> | null): T | undefined {
  return read === null || typeof read === "string" || isOff(read)
    ? undefined
    : read;
}

/** One's own tickets ready to serve, a line of them still live. */
const readyOf = (mine: MyOrders): string[] =>
  mine.rounds.flatMap((round) =>
    round.tickets
      .filter((ticket) => ticket.status === "ready" && ticket.lines > 0)
      .map((ticket) => ticket.id),
  );

/** The code of an error, never its message. */
const codeOf = (error: unknown) =>
  error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "without a code";

/**
 * What changed in waiter mode for the signed-in person (P4), for the mode's
 * screens, which ask every 15 seconds while visible, at once when they come
 * back on screen or online, and after their own writes
 * (`nextOrdersSyncDelay`): `GET /orders-sync?b=<business>&v=<the orders'
 * version>&m=<the menu's>&f=1&y=1&p=1&o=<an order>`, as `ordersSyncHref`
 * writes it. `f`, `y` and `p` ask for the floor, one's own rounds and the
 * kitchen's tickets; an empty `m` asks for the menu whole.
 *
 * Under the person's own session, so the database's read functions decide
 * what comes back, a view session's included (orders are the floor's work,
 * not anyone's secret: §6.4 of the design). The kitchen's read goes first,
 * since it marks what its reader's departments saw and may move the version;
 * the floor and one's own rounds then, unless it found nothing new; the menu
 * by its own version; the order whole only when the orders moved. 204 when
 * nothing asked moved; 409 `{off}` for a taker off a shift; 404 while the
 * module is off, for anyone it isn't for and before its migration; 401
 * signed out, never a redirect; 400 for a question that isn't one; 403 from
 * another site. Else 200 with each read that moved and the smallest version
 * among them (`syncedVersion`), so a write landing between two reads is read
 * again, never missed. Every answer is `no-store`.
 *
 * One's own rounds that came back with a ticket ready read its "מוכן" line
 * (P8b, `readOrderReady`): a ready ticket shown to its sender needs no push.
 *
 * Outside the proxy's matcher (tooling/proxy.test.ts), as /chat-sync is: a
 * poll costs one invocation, and an expired session is renewed here. Nothing
 * is logged but an error's code.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) return status(403);
  const query = readOrdersSyncQuery(new URL(request.url).searchParams);
  if (!query) return status(400);

  try {
    const own = await getOwnPlace();
    if (!own) return status(401);
    const { business } = query;
    const known = query.version ?? undefined;

    const prep = query.prep ? await getOrderPrep(business, known) : null;
    const prepSame = prep === "same";
    const [floor, mine, menu] = await Promise.all([
      query.floor && !prepSame ? getOrderFloor(business, known) : null,
      query.mine && !prepSame ? getMyOrders(business, known) : null,
      query.menu === null
        ? null
        : getMenu(business, query.menu === "new" ? undefined : query.menu),
    ]);
    const reads = [prep, floor, mine];
    if (
      [...reads, menu].some((read) => read === "closed" || read === "notYet")
    ) {
      return status(404);
    }
    const off = reads.find(isOff);
    if (off) {
      return Response.json(
        { off: off.off },
        { status: 409, headers: NO_STORE },
      );
    }

    const prepRead = answered(prep);
    const floorRead = answered(floor);
    const mineRead = answered(mine);
    // A ready ticket shown to its sender reads its line, so no push follows
    // (§9; P8b). Never while viewing as someone, and the sync answers
    // whatever this does.
    if (mineRead && !own.viewing) {
      try {
        await readOrderReady(own.userId, business, readyOf(mineRead));
      } catch (error) {
        console.error("reading the ready lines failed", codeOf(error));
      }
    }
    const versioned = [prepRead, floorRead, mineRead];
    const moved =
      query.version === null || versioned.some((read) => read !== undefined);
    const order =
      query.order && moved ? await getOrderDetail(query.order) : null;
    if (isOff(order)) {
      return Response.json(
        { off: order.off },
        { status: 409, headers: NO_STORE },
      );
    }
    if (order === "notYet") return status(404);

    const answer: OrdersSyncAnswer = {
      version: syncedVersion(versioned.map((read) => read?.version)),
    };
    if (prepRead) answer.prep = prepRead;
    if (floorRead) answer.floor = floorRead;
    if (mineRead) answer.mine = mineRead;
    const menuRead = answered(menu);
    if (menuRead) answer.menu = menuRead;
    // An order that closed or went is said once, as none.
    if (order === "closed") answer.order = null;
    else if (order && order !== "same") answer.order = order;

    if (
      answer.prep === undefined &&
      answer.floor === undefined &&
      answer.mine === undefined &&
      answer.menu === undefined &&
      answer.order === undefined
    ) {
      return status(204);
    }
    if (answer.version === null) answer.version = query.version;
    return Response.json(answer, { status: 200, headers: NO_STORE });
  } catch (error) {
    console.error("orders sync failed", codeOf(error));
    return status(500);
  }
}

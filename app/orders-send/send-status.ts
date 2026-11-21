import type { OrderFailure } from "@db/order-failures";

/** Why a send was refused before or by the database. */
export type SendFailure = OrderFailure | "signedOut" | "viewOnly";

/**
 * Each refusal's status, so the phone knows which to try again
 * (`retriesSend`: none of these but "failed", "notYet" while a deploy waits
 * for its migration). A refusal the person fixes in the draft is 422; one
 * the orders' state gives (the place taken, the order closed, an item sold
 * out meanwhile, off a shift) is 409; who they are, 401 and 403.
 */
export const SEND_STATUS: Record<SendFailure, number> = {
  invalid: 422,
  choices: 422,
  price: 422,
  allergy: 422,
  place: 422,
  body: 422,
  key: 409,
  taken: 409,
  closed: 409,
  moved: 409,
  unavailable: 409,
  route: 409,
  clock: 409,
  staleShift: 409,
  held: 409,
  window: 409,
  prepared: 409,
  takenBack: 409,
  cancelled: 409,
  comped: 409,
  served: 409,
  day: 409,
  takeaway: 409,
  notClosed: 409,
  off: 403,
  noAccess: 403,
  sender: 403,
  ownDepartment: 403,
  managersOnly: 403,
  viewOnly: 403,
  signedOut: 401,
  gone: 404,
  tooMany: 429,
  notYet: 503,
  failed: 500,
};

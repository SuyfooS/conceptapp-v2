/** The machine itself, with a port or without. */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * How a request reached the app: what the proxy in front of it says
 * (`x-forwarded-proto`; Vercel's, or Next.js's own on `next start`), else
 * http on the machine itself and https anywhere else. `host` is the
 * forwarded host, or the Host header.
 */
export function requestProtocol(
  host: string | null | undefined,
  forwardedProto: string | null | undefined,
): string {
  if (forwardedProto) return forwardedProto;
  return host && LOCAL_HOST.test(host) ? "http" : "https";
}

/**
 * Whether cookies set for this request may be Secure: only over https. The
 * browser tests run on http://127.0.0.1, where a Secure cookie would be
 * dropped and nobody could sign in.
 */
export function isSecureRequest(
  host: string | null | undefined,
  forwardedProto: string | null | undefined,
): boolean {
  return requestProtocol(host, forwardedProto) === "https";
}

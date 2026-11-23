/**
 * A path inside the app: one slash, then no scheme, host, backslash or
 * control character that a browser could read as one.
 */
export function isAppPath(url: unknown): url is `/${string}` {
  return (
    typeof url === "string" &&
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("\\") &&
    [...url].every((char) => char.charCodeAt(0) > 0x1f)
  );
}

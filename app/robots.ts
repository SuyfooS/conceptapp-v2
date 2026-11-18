import type { MetadataRoute } from "next";

/**
 * /robots.txt, the same on every host: search may read every page. The
 * design gallery and invite links (`OUT_OF_SEARCH` in
 * `@domain/security-headers`) stay crawlable on purpose (#80): they answer
 * with `X-Robots-Tag: noindex` (next.config.ts) and say `index: false` in
 * their metadata, and a crawler has to fetch a page to see its noindex. A
 * `Disallow` here would hide both and still let search list the bare address
 * when another page links to it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
  };
}

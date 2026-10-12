import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";

// No locale routing yet: every request is Hebrew. Not reading the request
// keeps pages static under cacheComponents. A per-user or per-business
// locale replaces the constant here when it arrives.
export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

"use client";

import "@fontsource-variable/heebo";
import { useEffect } from "react";
import { defaultLocale, direction } from "@/i18n/config";
import { ErrorScreen } from "./error-screen";
import { globalErrorCopy as t } from "./global-error-copy";
import "./globals.css";

// When the root layout itself fails, this replaces it, so it brings its own
// document, styles and copy: the layout's translation provider is gone with it.
// A full reload is the one retry that does not depend on what just broke.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html
      lang={defaultLocale}
      dir={direction(defaultLocale)}
      className="h-full"
    >
      <body className="min-h-full bg-bg text-ink">
        <title>{t.title}</title>
        <ErrorScreen
          title={t.title}
          body={t.body}
          retry={t.retry}
          home={t.home}
          onRetry={() => window.location.reload()}
        />
      </body>
    </html>
  );
}

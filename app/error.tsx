"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { ErrorScreen } from "./error-screen";

// Anything that fails under the root layout. `retry` fetches the screen again
// from the server; the details stay out of what people see, in the logs.
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      title={t("title")}
      body={t("body")}
      retry={t("retry")}
      home={t("home")}
      onRetry={retry}
    />
  );
}

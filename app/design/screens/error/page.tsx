"use client";

import { useTranslations } from "next-intl";
import { ErrorScreen } from "../../../error-screen";

// What a failure looks like, without having to fail.
export default function ErrorDemo() {
  const t = useTranslations("errors");
  return (
    <ErrorScreen
      title={t("title")}
      body={t("body")}
      retry={t("retry")}
      home={t("home")}
      onRetry={() => {}}
    />
  );
}

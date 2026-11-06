"use client";

import { Button } from "@ui/button";
import { useTranslations } from "next-intl";
import { useState } from "react";

// A screen that really fails on request, so the error boundary and its "try
// again" can be seen and tested end to end.
export default function ErrorBoundaryDemo() {
  const t = useTranslations("design");
  const [failing, setFailing] = useState(false);
  if (failing) throw new Error("A failure on request, for the design demo");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
      <h1 className="font-bold text-xl">{t("errorDemoTitle")}</h1>
      <Button onClick={() => setFailing(true)}>{t("errorDemoAction")}</Button>
    </main>
  );
}

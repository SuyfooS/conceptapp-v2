import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { Compass } from "lucide-react";
import Link from "next/link";
import { baseWording, translator } from "../wording";

// A conversation the person doesn't read, or that doesn't exist, which is
// the same: the app's not-found screen in its words, beside the list from
// tablet up. Nothing says whether such a conversation exists.
export default function ChatNotFound() {
  // Drawn before the business is known: the app's own words.
  const t = translator(baseWording, "app.notFound");
  return (
    <div className="flex min-h-[70dvh] items-center xl:col-span-2">
      <EmptyState icon={<Compass />} title={t("title")} body={t("body")}>
        <Button asChild size="lg">
          <Link href="/home">{t("home")}</Link>
        </Button>
      </EmptyState>
    </div>
  );
}

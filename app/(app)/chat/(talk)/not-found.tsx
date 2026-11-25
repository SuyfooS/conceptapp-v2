import { Button } from "@ui/button";
import { Compass } from "lucide-react";
import Link from "next/link";
import { baseWording, translator } from "../../wording";
import { ChatNotFoundState } from "../chat-not-found-state";

// A conversation the person doesn't read, or that doesn't exist, which is
// the same: the app's not-found screen in its words, beside the list from
// tablet up. Nothing says whether such a conversation exists. Drawn in
// place of a chat whose reader no longer reads it (their department removed,
// or they were taken out of it, as they sent in it), its title takes the
// focus that went with the field; from tablet up, also from the list's row
// or "שליחת הודעה" that opened it, as a chat's title does
// (`ChatNotFoundState`).
export default function ChatNotFound() {
  // Drawn before the business is known: the app's own words.
  const t = translator(baseWording, "app.notFound");
  return (
    <div className="flex min-h-[70dvh] items-center xl:col-span-2">
      <ChatNotFoundState icon={<Compass />} title={t("title")} body={t("body")}>
        <Button asChild size="lg">
          <Link href="/home">{t("home")}</Link>
        </Button>
      </ChatNotFoundState>
    </div>
  );
}

import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { AuthScreen } from "../../../(auth)/auth-screen";
import { SignInForm } from "../../../(auth)/sign-in/sign-in-form";
import { demoSignIn } from "../actions";
import { captchaTwinOf } from "../captcha-twin";
import { refusalTwinOf } from "../refusal-twin";

type Props = {
  searchParams: Promise<{
    step?: string;
    door?: string;
    captcha?: string;
    error?: string;
  }>;
};

// The real sign-in, with a stand-in action, so its second step can be seen with
// no database. `?step=code` opens on the code step, as any valid number
// reaches it, with its help for a code that didn't come. `?door=off`: as the
// site of real businesses has it, whose demo door is closed (DEMO_DOOR=off),
// with no way to the demo. The two go together (`?step=code&door=off`).
// The "אני לא רובוט" check (P9b): `?captcha=` a state of its stand-in
// (`captchaTwinOf`), or Cloudflare's own test widget (`live`, `ask`);
// `?error=captcha` a send the auth server refused for it, on either step;
// `?error=network` too many codes from this network (closing the pilot,
// PR 2), twelve minutes to wait, on either step too.
export default function SignInDemo({ searchParams }: Props) {
  const t = useTranslations("auth.signIn");
  return (
    <AuthScreen title={t("title")}>
      <Suspense>
        <DemoForm searchParams={searchParams} />
      </Suspense>
    </AuthScreen>
  );
}

async function DemoForm({ searchParams }: Props) {
  const { step, door, captcha, error } = await searchParams;
  const refused = refusalTwinOf(error);
  return (
    <SignInForm
      signIn={demoSignIn}
      captcha={captchaTwinOf(captcha)}
      demoHref={door === "off" ? undefined : "/design/screens/enter"}
      start={
        step === "code"
          ? { step: "code", phone: "+972501234567", ...refused }
          : refused
            ? { step: "phone", ...refused }
            : undefined
      }
    />
  );
}

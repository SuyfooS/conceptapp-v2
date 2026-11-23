import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { AuthScreen } from "../../../(auth)/auth-screen";
import { SignInForm } from "../../../(auth)/sign-in/sign-in-form";
import { demoSignIn } from "../actions";

type Props = { searchParams: Promise<{ door?: string }> };

// The real sign-in, with a stand-in action, so its second step can be seen with
// no database. ?door=off: as the site of real businesses has it, whose demo
// door is closed (DEMO_DOOR=off), with no way to the demo.
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
  const { door } = await searchParams;
  return (
    <SignInForm
      signIn={demoSignIn}
      demoHref={door === "off" ? undefined : "/design/screens/enter"}
    />
  );
}

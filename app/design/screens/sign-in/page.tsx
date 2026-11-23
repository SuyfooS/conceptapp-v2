import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { AuthScreen } from "../../../(auth)/auth-screen";
import { SignInForm } from "../../../(auth)/sign-in/sign-in-form";
import { demoSignIn } from "../actions";

type Props = { searchParams: Promise<{ step?: string }> };

// The real sign-in, with a stand-in action, so its second step can be seen with
// no database. `?step=code` opens on the code step, as any valid number
// reaches it, with its help for a code that didn't come.
export default function SignInDemo({ searchParams }: Props) {
  const t = useTranslations("auth.signIn");
  return (
    <AuthScreen title={t("title")}>
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthScreen>
  );
}

async function Form({ searchParams }: Props) {
  const { step } = await searchParams;
  return (
    <SignInForm
      signIn={demoSignIn}
      demoHref="/design/screens/enter"
      start={
        step === "code" ? { step: "code", phone: "+972501234567" } : undefined
      }
    />
  );
}

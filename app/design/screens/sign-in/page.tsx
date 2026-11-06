import { useTranslations } from "next-intl";
import { AuthScreen } from "../../../(auth)/auth-screen";
import { SignInForm } from "../../../(auth)/sign-in/sign-in-form";
import { demoSignIn } from "../actions";

// The real sign-in, with a stand-in action, so its second step can be seen with
// no database.
export default function SignInDemo() {
  const t = useTranslations("auth.signIn");
  return (
    <AuthScreen title={t("title")}>
      <SignInForm signIn={demoSignIn} />
    </AuthScreen>
  );
}

import { useTranslations } from "next-intl";
import { AuthScreen } from "../../../(auth)/auth-screen";
import { EnterForm } from "../../../(auth)/enter/enter-form";
import { demoEnter, demoReset } from "../actions";

// The real passive door, with a stand-in action that goes to the demo app.
export default function EnterDemo() {
  const t = useTranslations("auth.enter");
  return (
    <AuthScreen title={t("title")}>
      <EnterForm enter={demoEnter} reset={demoReset} />
    </AuthScreen>
  );
}

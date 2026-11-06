import { redirect } from "next/navigation";

// There is no landing page yet: the root opens the app, and the proxy sends
// anyone signed out on to sign-in.
export default function Root() {
  redirect("/home");
}

import { NoBusinessScreen } from "../../../(app)/no-business";
import { demoSignOut } from "../actions";

export default function NoBusinessDemo() {
  return <NoBusinessScreen signOut={demoSignOut} />;
}

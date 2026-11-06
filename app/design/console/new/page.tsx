import { NewBusinessView } from "../../../(admin)/admin/new/new-business-view";
import { demoCreateBusiness } from "../actions";

// The real wizard, with a stand-in for opening the business.
export default function ConsoleNewDemo() {
  return (
    <NewBusinessView listHref="/design/console" create={demoCreateBusiness} />
  );
}

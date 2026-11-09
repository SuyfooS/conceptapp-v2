import { SendForm } from "../../../../(app)/lists/send/send-form";
import { demoSendList } from "../actions";
import { demoSendForm } from "../data";
import { demoListsPaths } from "../paths";

// Sending a list on the demo: the restaurant's templates and people. Sending
// goes back to Lists, which shows the list as just sent.
export default function ShellSendList() {
  return (
    <SendForm
      data={demoSendForm}
      send={demoSendList}
      paths={{ lists: demoListsPaths.lists }}
    />
  );
}

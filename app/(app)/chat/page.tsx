import { currentWording } from "../current-wording";
import { ModuleScreen, moduleMetadata } from "../module-screen";

export const generateMetadata = () => moduleMetadata("chat");

// Chat is off everywhere until its screens arrive (C2). A team member who
// switches it on in the console before then reaches this, not "not found".
export default async function ChatPage() {
  return <ModuleScreen moduleKey="chat" wording={await currentWording()} />;
}

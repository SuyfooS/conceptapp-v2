import { DemoScreen } from "../../../demo-store";
import { ImportTwin } from "./import-twin";

// Pasting a café's menu as it was found: categories, two sizes and extras,
// checked against the menu already there, each line said in the preview.
// `?state=reversed`, `?state=problems` and `?state=known` start from other
// pastes.
export default function OrderMenuImportPage() {
  return (
    <DemoScreen>
      <ImportTwin />
    </DemoScreen>
  );
}

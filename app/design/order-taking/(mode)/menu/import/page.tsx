import { DemoScreen } from "../../../demo-store";
import { ImportScreen } from "./import-screen";

// Pasting a café's menu as it was found: categories, two sizes, extras, a
// line repeated, a price that isn't clear and a line a PDF turned around,
// each said in the preview.
export default function OrderMenuImportPage() {
  return (
    <DemoScreen>
      <ImportScreen />
    </DemoScreen>
  );
}

import { DemoScreen } from "../../../demo-store";
import { CategoriesTwin } from "./categories-twin";

// The demo restaurant's categories, each to the kitchen or the bar.
export default function OrderMenuCategoriesPage() {
  return (
    <DemoScreen>
      <CategoriesTwin />
    </DemoScreen>
  );
}

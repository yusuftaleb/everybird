import { expect, type Page } from "@playwright/test";
import { en, type Ui } from "../src/i18n/messages/en";

// The Add birds dialog (src/components/import/AddBirdsDialog.tsx): opened by "Add birds" on the collage and Settings
// and by the landing's "Make yours"; its two ways in are "Import a file" (the source rows) and "Add by hand".

export type AddWay = "file" | "hand";

export const addDialog = (page: Page, ui: Ui = en.ui) => page.getByRole("dialog", { name: ui.collage.addBirds });

/** Opens the dialog from the page's "Add birds" button (unless it is open already) and picks `way`. */
export async function openAdd(page: Page, way: AddWay, ui: Ui = en.ui) {
  const dialog = addDialog(page, ui);
  if (!(await dialog.isVisible())) await page.getByRole("button", { name: ui.collage.addBirds, exact: true }).click();
  const choice = dialog.getByRole("button", { name: ui.add[way], exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  return dialog;
}

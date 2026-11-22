import { expect, type Locator, type Page } from "@playwright/test";
import { en, type Ui } from "../src/i18n/messages/en";

// Adding birds. On Settings the source rows ("Your list", #sources) are in the page, behind no click, and the heading
// row's "Add by hand" opens the Add birds dialog on adding by hand alone: titled "Add by hand", with no switch to Import
// a file. Elsewhere the Add birds dialog (src/components/import/AddBirdsDialog.tsx), opened by the collage's "Add birds"
// and the landing's "Make yours", starts at "Import a file" (the source rows); "Add by hand" is its other choice.

export type AddWay = "file" | "hand";

export const addDialog = (page: Page, ui: Ui = en.ui) => page.getByRole("dialog", { name: ui.collage.addBirds });
/** Settings' Add by hand dialog. */
export const handDialog = (page: Page, ui: Ui = en.ui) => page.getByRole("dialog", { name: ui.add.hand });

/** Where `way` is: Settings' own section or its Add by hand dialog, or the Add birds dialog (opened from the page's
 *  "Add birds" unless it is open) at `way`. */
export async function openAdd(page: Page, way: AddWay, ui: Ui = en.ui): Promise<Locator> {
  if (new URL(page.url()).pathname.endsWith("/settings")) {
    if (way === "file") {
      const section = page.locator("#sources");
      await expect(section).toBeVisible();
      return section;
    }
    const dialog = handDialog(page, ui);
    if (!(await dialog.isVisible())) await page.locator("#sources").getByRole("button", { name: ui.add.hand, exact: true }).click();
    await expect(dialog).toBeVisible();
    // Adding by hand alone: no switch to Import a file.
    await expect(dialog.getByRole("group", { name: ui.add.ways })).toHaveCount(0);
    return dialog;
  }
  const dialog = addDialog(page, ui);
  if (!(await dialog.isVisible())) await page.getByRole("button", { name: ui.collage.addBirds, exact: true }).click();
  const choice = dialog.getByRole("button", { name: ui.add[way], exact: true });
  if (way === "hand") await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  return dialog;
}

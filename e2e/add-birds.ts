import { expect, type Locator, type Page } from "@playwright/test";
import { en, type Ui } from "../src/i18n/messages/en";

// Adding birds. On Settings the source rows ("Your list", #sources) and Add by hand (#tick) are in the page, behind no
// click. Elsewhere the Add birds dialog (src/components/import/AddBirdsDialog.tsx), opened by the collage's "Add birds"
// and the landing's "Make yours", starts at "Import a file" (the source rows); "Add by hand" is its other choice.

export type AddWay = "file" | "hand";

export const addDialog = (page: Page, ui: Ui = en.ui) => page.getByRole("dialog", { name: ui.collage.addBirds });

/** Where `way` is: Settings' own section, or the dialog (opened from the page's "Add birds" unless it is open) at `way`. */
export async function openAdd(page: Page, way: AddWay, ui: Ui = en.ui): Promise<Locator> {
  if (new URL(page.url()).pathname.endsWith("/settings")) {
    const section = page.locator(way === "file" ? "#sources" : "#tick");
    await expect(section).toBeVisible();
    return section;
  }
  const dialog = addDialog(page, ui);
  if (!(await dialog.isVisible())) await page.getByRole("button", { name: ui.collage.addBirds, exact: true }).click();
  const choice = dialog.getByRole("button", { name: ui.add[way], exact: true });
  if (way === "hand") await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  return dialog;
}

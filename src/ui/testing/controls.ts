// For the jsdom tests only: choose in a themed Select or TimeField (design.md 8.28, 8.30) the way a person does,
// by opening it and pressing an option. It replaces `fireEvent.change` on the native drop-down that is gone.
import "./css-escape";
import { fireEvent, screen, within } from "@testing-library/react";

/** The button of a Select or TimeField, by its name (the label, then the value). */
export function selectButton(name: string | RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

/** Opens the Select named `name` and chooses the option whose value is `value`. */
export async function chooseOption(
  name: string | RegExp,
  value: string,
): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name }));
  const list = await screen.findByRole("listbox");
  const option = within(list)
    .getAllByRole("option")
    .find((o) => o.getAttribute("data-value") === value);
  if (!option) throw new Error(`No option with the value ${value}`);
  fireEvent.click(option);
}

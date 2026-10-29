import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "./App";

it("shows the page heading", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "Keyloop Service Scheduler" }),
  ).toBeTruthy();
});

it("runs in a browser-like environment", () => {
  expect(typeof document).toBe("object");
});

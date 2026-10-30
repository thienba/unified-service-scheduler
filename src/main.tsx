// First: Zod must be set up before any module makes a schema (see the file).
import "./ui/forms/zod-config";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { mockEnabled } from "./config";
import { App } from "./ui/app/App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page has no #root element.");
}

// The mock backend starts before the page renders, and only when the build is not a remote one.
let mockFetch: typeof fetch | undefined;
if (mockEnabled) {
  const { bootMock } = await import("./boot-mock");
  mockFetch = (await bootMock()).fetch;
}

createRoot(root).render(
  <StrictMode>
    <App {...(mockFetch ? { fetch: mockFetch } : {})} />
  </StrictMode>,
);

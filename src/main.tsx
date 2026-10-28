import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { App } from "./ui/app/App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page has no #root element.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

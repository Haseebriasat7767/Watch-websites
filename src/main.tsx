import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ImmersiveStory from "./story/ImmersiveStory";
import "./index.css";
import "./atelier.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found in the document.");
}

createRoot(container).render(
  <StrictMode>
    <ImmersiveStory />
  </StrictMode>,
);

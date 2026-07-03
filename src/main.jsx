import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import OpticalFilmSoundLab from "./OpticalFilmSoundLab.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <OpticalFilmSoundLab />
  </StrictMode>,
);

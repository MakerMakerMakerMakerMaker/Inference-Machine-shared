import { createRoot } from "react-dom/client";
import "./design/fonts/fonts.css";
import "./design/tokens.css";
import "./styles/board.css";
import { App } from "./App";
import "./styles/mobile.css";
import "./sound";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(<App />);

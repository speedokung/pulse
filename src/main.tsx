import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { bootLine } from "./lib/line";
import { registerSW } from "./lib/pwa";

registerSW();
// inside LINE, LIFF has to restore the address (?p=…, ?link=…) before the app reads it
bootLine().finally(() => createRoot(document.getElementById("root")!).render(<App />));

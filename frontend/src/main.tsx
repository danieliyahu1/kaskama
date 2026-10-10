import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { appConfig, loadAppConfig } from "./app-config.js";
import "./styles.css";

const root = document.getElementById("root")!;
// index.html carries a <noscript> shell for clients that never run this code.
// Clear it so a browser that does run the app never paints it.
root.replaceChildren();
const app = createRoot(root);
const render = () =>
  app.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// Render with the build-time default at once, so the page is never blank while
// /api/config is in flight.
const initialNetwork = appConfig().network;
render();

// The server owns the network identity. When it disagrees with the default,
// render once more so address prefixes and the wallet network are correct.
void loadAppConfig().then(() => {
  if (appConfig().network !== initialNetwork) render();
});

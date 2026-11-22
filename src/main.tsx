import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

// Installable launch surface only: the worker does not cache records or enable offline mode.
if (import.meta.env.PROD && window.isSecureContext && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      console.warn("App launcher registration failed");
    });
  });
}

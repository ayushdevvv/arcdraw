import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Toaster from "./components/toast/Toaster.jsx";
import AppSafety from "./components/AppSafety.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./theme/ThemeContext.jsx";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import "./auth.css";
import "./home.css";
import "./workspace.css";
import "./editor.css";
import "./polish.css";
import { removeOldServiceWorker } from "./utils/removeOldServiceWorker.js";

removeOldServiceWorker();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <AppSafety />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);

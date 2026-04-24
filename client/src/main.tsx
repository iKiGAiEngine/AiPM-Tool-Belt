import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary, installGlobalErrorHandlers } from "@/components/ErrorBoundary";

installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

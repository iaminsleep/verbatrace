import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import "./index.css";

import App from "./App";
import { version } from "../package.json";
import { logError, startDiagnostics } from "./local/diagnostics";
import { ThemeProvider } from "./app/theme";
import { TooltipProvider } from "./components/ui/tooltip";
import { LocaleProvider } from "./i18n";

startDiagnostics(version);

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => logError("query.error", error, { operation: String(query.queryKey[0]) }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _result, mutation) => logError("mutation.error", error, { operation: String(mutation.options.mutationKey?.[0] ?? "unknown") }),
  }),
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LocaleProvider>
          {
}
          <TooltipProvider delayDuration={400} skipDelayDuration={300}>
            <QueryClientProvider client={queryClient}>
              <App />
              {

}
              <Toaster
                position="bottom-right"
                toastOptions={{
                  className:
                    "!bg-elevated !text-foreground !border !border-border !rounded-md !text-[13px]",
                }}
              />
            </QueryClientProvider>
          </TooltipProvider>
        </LocaleProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

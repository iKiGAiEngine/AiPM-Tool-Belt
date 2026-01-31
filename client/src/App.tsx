import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { Header } from "@/components/Header";
import HomePage from "@/pages/HomePage";
import UploadPage from "@/pages/UploadPage";
import ReviewPage from "@/pages/ReviewPage";
import PlanParserPage from "@/pages/PlanParserPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/specsift" component={UploadPage} />
      <Route path="/specsift/review" component={ReviewPage} />
      <Route path="/specsift/settings" component={SettingsPage} />
      <Route path="/planparser" component={PlanParserPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <div className="min-h-screen bg-background">
            <Header />
            <Router />
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

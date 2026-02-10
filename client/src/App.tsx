import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { TestModeProvider } from "@/lib/testMode";
import { Header } from "@/components/Header";
import HomePage from "@/pages/HomePage";
import UploadPage from "@/pages/UploadPage";
import ReviewPage from "@/pages/ReviewPage";
import PlanParserPage from "@/pages/PlanParserPage";
import SettingsPage from "@/pages/SettingsPage";
import CentralSettingsPage from "@/pages/CentralSettingsPage";
import QuoteParserPage from "@/pages/QuoteParserPage";
import ProjectStartPage from "@/pages/ProjectStartPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import ProjectLogPage from "@/pages/ProjectLogPage";
import ScheduleConverterPage from "@/pages/ScheduleConverterPage";
import SpecExtractorPage from "@/pages/SpecExtractorPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/specsift" component={UploadPage} />
      <Route path="/specsift/review" component={ReviewPage} />
      <Route path="/specsift/settings" component={SettingsPage} />
      <Route path="/planparser" component={PlanParserPage} />
      <Route path="/quoteparser" component={QuoteParserPage} />
      <Route path="/settings" component={CentralSettingsPage} />
      <Route path="/project-start" component={ProjectStartPage} />
      <Route path="/projects/:id" component={ProjectDetailPage} />
      <Route path="/project-log" component={ProjectLogPage} />
      <Route path="/schedule-converter" component={ScheduleConverterPage} />
      <Route path="/spec-extractor" component={SpecExtractorPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TestModeProvider>
          <TooltipProvider>
            <div className="min-h-screen bg-background">
              <Header />
              <Router />
            </div>
            <Toaster />
          </TooltipProvider>
        </TestModeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

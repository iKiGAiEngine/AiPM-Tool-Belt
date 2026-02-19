import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { TestModeProvider } from "@/lib/testMode";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Loader2 } from "lucide-react";
import HomePage from "@/pages/HomePage";
import PlanParserPage from "@/pages/PlanParserPage";
import CentralSettingsPage from "@/pages/CentralSettingsPage";
import QuoteParserPage from "@/pages/QuoteParserPage";
import ProjectStartPage from "@/pages/ProjectStartPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import ProjectLogPage from "@/pages/ProjectLogPage";
import ScheduleConverterPage from "@/pages/ScheduleConverterPage";
import SpecExtractorPage from "@/pages/SpecExtractorPage";
import LoginPage from "@/pages/LoginPage";
import AdminPage from "@/pages/AdminPage";
import AuditLogPage from "@/pages/AuditLogPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/home" component={HomePage} />
      <Route path="/planparser" component={PlanParserPage} />
      <Route path="/quoteparser" component={QuoteParserPage} />
      <Route path="/settings" component={CentralSettingsPage} />
      <Route path="/project-start" component={ProjectStartPage} />
      <Route path="/projects/:id" component={ProjectDetailPage} />
      <Route path="/project-log" component={ProjectLogPage} />
      <Route path="/schedule-converter" component={ScheduleConverterPage} />
      <Route path="/spec-extractor" component={SpecExtractorPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/audit" component={AuditLogPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <TestModeProvider>
      <div className="min-h-screen bg-background">
        <Header />
        <Router />
      </div>
    </TestModeProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

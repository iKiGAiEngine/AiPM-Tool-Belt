import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { TestModeProvider } from "@/lib/testMode";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Clock, Wrench, LogOut } from "lucide-react";
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

function PendingApprovalScreen() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary mb-4">
            <Wrench className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">AiPM Tool Belt</h1>
        </div>

        <Card className="p-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <Clock className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <h2 className="font-semibold text-lg mb-1" data-testid="text-pending-title">Account Pending Approval</h2>
              <p className="text-sm text-muted-foreground">
                Your account ({user?.email}) has been created. An administrator needs to grant you access before you can use the application.
              </p>
            </div>
            <Button variant="outline" onClick={logout} className="w-full" data-testid="button-pending-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </Card>
      </div>
    </div>
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

  if (!isAdmin) {
    return <PendingApprovalScreen />;
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

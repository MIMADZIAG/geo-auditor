import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Results from "./pages/Results";
import Dashboard from "./pages/Dashboard";
import PublicReport from "./pages/PublicReport";
import Pricing from "./pages/Pricing";
import Sandbox from "./pages/Sandbox";
import PageCreator from "./pages/PageCreator";
import PageCreatorResult from "./pages/PageCreatorResult";
import CitationPulse from "./pages/CitationPulse";
function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/results/:id">
        <ErrorBoundary context="Results page">
          <Results />
        </ErrorBoundary>
      </Route>
      <Route path="/report/:id">
        <ErrorBoundary context="Public Report">
          <PublicReport />
        </ErrorBoundary>
      </Route>
      <Route path="/dashboard">
        <ErrorBoundary context="Dashboard">
          <Dashboard />
        </ErrorBoundary>
      </Route>
      <Route path="/pricing" component={Pricing} />
      <Route path="/sandbox">
        <ErrorBoundary context="Sandbox">
          <Sandbox />
        </ErrorBoundary>
      </Route>
      <Route path="/page-creator">
        <ErrorBoundary context="Page Creator">
          <PageCreator />
        </ErrorBoundary>
      </Route>
      <Route path="/page-creator/:id">
        <ErrorBoundary context="Page Creator Result">
          <PageCreatorResult />
        </ErrorBoundary>
      </Route>
      <Route path="/pulse">
        <ErrorBoundary context="Citation Pulse">
          <CitationPulse />
        </ErrorBoundary>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "oklch(0.14 0.015 250)",
                border: "1px solid oklch(0.22 0.015 250)",
                color: "oklch(0.96 0.005 250)",
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

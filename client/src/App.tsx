import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppProvider } from "@/lib/store";
import DashboardLayout from "@/components/layout/DashboardLayout";
import MediaScanner from "@/pages/MediaScanner";
import ArtifactAnalyzer from "@/pages/ArtifactAnalyzer";

function Router() {
  return (
    <Switch>
      <Route path="/" component={MediaScanner} />
      <Route path="/media-scanner" component={MediaScanner} />
      <Route path="/artifact-analyzer" component={ArtifactAnalyzer} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppProvider>
          <DashboardLayout>
            <Router />
          </DashboardLayout>
          <Toaster />
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

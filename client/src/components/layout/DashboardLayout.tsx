import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Search, 
  Settings, 
  Activity, 
  FileText, 
  TerminalSquare,
  Database,
  ShieldAlert,
  Archive
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/lib/store";
import { Button } from "@/components/ui/button";
import LogsPanel from "@/components/shared/LogsPanel";
import JobQueue from "@/components/shared/JobQueue";
import ReportDialog from "@/components/shared/ReportDialog";
import { Progress } from "@/components/ui/progress";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const { isLogsOpen, setLogsOpen, jobs } = useAppContext();
  const [isReportOpen, setIsReportOpen] = useState(false);

  const activeJobs = jobs.filter(j => j.status === "running" || j.status === "pending");
  const overallProgress = activeJobs.length > 0 
    ? activeJobs.reduce((acc, j) => acc + j.progress, 0) / activeJobs.length 
    : 0;

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/50 bg-card/30 backdrop-blur-xl flex flex-col justify-between">
        <div className="p-6 flex flex-col gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white/90">JuiceSuite</h1>
          </div>
          
          <nav className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Workspaces</p>
            <NavItem 
              href="/media-scanner" 
              icon={<Search className="w-4 h-4" />} 
              label="Media Scanner" 
              active={location === "/media-scanner" || location === "/"} 
            />
            <NavItem 
              href="/artifact-analyzer" 
              icon={<Database className="w-4 h-4" />} 
              label="Artifact Analyzer" 
              active={location === "/artifact-analyzer"} 
            />
          </nav>

          <nav className="flex flex-col gap-2 mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tools</p>
            <Button variant="ghost" className="justify-start text-muted-foreground hover:text-white w-full" onClick={() => setLogsOpen(true)}>
              <TerminalSquare className="w-4 h-4 mr-3" />
              System Logs
            </Button>
            <Button variant="ghost" className="justify-start text-muted-foreground hover:text-white w-full" onClick={() => setIsReportOpen(true)}>
              <FileText className="w-4 h-4 mr-3" />
              Generate Report
            </Button>
            <Button variant="ghost" className="justify-start text-muted-foreground hover:text-white w-full">
              <Settings className="w-4 h-4 mr-3" />
              Settings
            </Button>
          </nav>
        </div>

        <div className="p-6 border-t border-border/50">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/80">Active Jobs</span>
              <Activity className={cn("w-4 h-4 text-blue-500", activeJobs.length > 0 && "animate-pulse")} />
            </div>
            {activeJobs.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Progress value={overallProgress} className="h-1.5" />
                <span className="text-xs text-muted-foreground">{activeJobs.length} job(s) running...</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Idle</span>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative h-full overflow-hidden">
        <header className="h-16 border-b border-border/50 flex items-center justify-between px-8 bg-background/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full bg-blue-500/20 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Engine Online</span>
          </div>
          <JobQueue />
        </header>

        <div className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>

      <LogsPanel />
      <ReportDialog open={isReportOpen} onOpenChange={setIsReportOpen} />
    </div>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 text-sm font-medium",
      active 
        ? "bg-blue-600/10 text-blue-500" 
        : "text-muted-foreground hover:bg-white/5 hover:text-white"
    )}>
      {icon}
      {label}
    </Link>
  );
}

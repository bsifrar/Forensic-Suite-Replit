import { useAppContext } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Activity, XCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function JobQueue() {
  const { jobs, cancelJob } = useAppContext();
  
  const runningCount = jobs.filter(j => j.status === "running" || j.status === "pending").length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button data-testid="button-job-queue" variant="outline" size="sm" className="relative glass-panel border-white/10 hover:bg-white/5">
          <Activity className="w-4 h-4 mr-2" />
          Queue
          {runningCount > 0 && (
            <Badge className="ml-2 bg-blue-500 hover:bg-blue-600 text-white border-0 h-5 px-1.5 flex items-center justify-center">
              {runningCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 glass-panel border-white/10 p-0 shadow-2xl shadow-black">
        <div className="p-4 border-b border-white/10">
          <h4 className="font-semibold text-sm">Background Jobs</h4>
          <p className="text-xs text-muted-foreground mt-1">Server-side processing tasks</p>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {jobs.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No recent jobs.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {jobs.slice(0, 20).map(job => (
                <div key={job.id} className="p-3 rounded-md bg-white/5 border border-white/5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate max-w-[180px]" title={job.name}>{job.name}</span>
                    <JobStatusIcon status={job.status} />
                  </div>
                  {(job.status === "running" || job.status === "pending") && (
                    <div className="flex items-center gap-2">
                      <Progress value={job.progress} className="h-1 flex-1" />
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{job.progress}%</span>
                      <button data-testid={`button-cancel-job-${job.id}`} onClick={() => cancelJob(job.id)} className="text-muted-foreground hover:text-red-400">
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {job.status === "cancelled" && <span className="text-[10px] text-red-400 font-medium">Cancelled</span>}
                  {job.status === "completed" && <span className="text-[10px] text-green-400 font-medium">Completed</span>}
                  {job.status === "failed" && <span className="text-[10px] text-red-400 font-medium">Failed</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function JobStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running': return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
    case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
    case 'cancelled': return <XCircle className="w-4 h-4 text-muted-foreground" />;
    default: return <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-pulse" />;
  }
}

import { createContext, useContext, useState, ReactNode } from "react";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  name: string;
  type: "media_scan" | "artifact_extract" | "report_gen";
  progress: number;
  status: JobStatus;
  startTime?: Date;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "success";
  message: string;
  module: string;
}

interface AppContextType {
  jobs: Job[];
  logs: LogEntry[];
  addJob: (job: Omit<Job, "id" | "status" | "progress">) => void;
  cancelJob: (id: string) => void;
  addLog: (level: LogEntry["level"], message: string, module: string) => void;
  clearLogs: () => void;
  isLogsOpen: boolean;
  setLogsOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([
    { id: "job-1", name: "Scan: /Volumes/Evidence/Export", type: "media_scan", progress: 45, status: "running", startTime: new Date() }
  ]);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: "log-1", timestamp: new Date(), level: "info", message: "System initialized. Engine ready.", module: "System" },
    { id: "log-2", timestamp: new Date(), level: "success", message: "Loaded 453 signatures.", module: "ArtifactAnalyzer" }
  ]);
  const [isLogsOpen, setLogsOpen] = useState(false);

  const addJob = (job: Omit<Job, "id" | "status" | "progress">) => {
    const newJob: Job = {
      ...job,
      id: `job-${Math.random().toString(36).substr(2, 9)}`,
      status: "pending",
      progress: 0,
      startTime: new Date()
    };
    setJobs((prev) => [newJob, ...prev]);
    
    // Simulate job progress
    setTimeout(() => {
      setJobs((prev) => prev.map(j => j.id === newJob.id ? { ...j, status: "running" } : j));
      const interval = setInterval(() => {
        setJobs((prev) => prev.map(j => {
          if (j.id === newJob.id && j.status === "running") {
            const newProgress = j.progress + Math.floor(Math.random() * 10) + 5;
            if (newProgress >= 100) {
              clearInterval(interval);
              addLog("success", `Completed task: ${j.name}`, "JobQueue");
              return { ...j, progress: 100, status: "completed" };
            }
            return { ...j, progress: newProgress };
          }
          return j;
        }));
      }, 800);
    }, 1000);
  };

  const cancelJob = (id: string) => {
    setJobs((prev) => prev.map(j => j.id === id ? { ...j, status: "cancelled" } : j));
    addLog("warn", `Cancelled task: ${id}`, "JobQueue");
  };

  const addLog = (level: LogEntry["level"], message: string, module: string) => {
    setLogs((prev) => [{
      id: `log-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message,
      module
    }, ...prev]);
  };

  const clearLogs = () => setLogs([]);

  return (
    <AppContext.Provider value={{ jobs, logs, addJob, cancelJob, addLog, clearLogs, isLogsOpen, setLogsOpen }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  name: string;
  type: string;
  progress: number;
  status: JobStatus;
  startTime: string;
  result?: any;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  module: string;
}

interface AppContextType {
  jobs: Job[];
  logs: LogEntry[];
  refreshJobs: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
  clearLogs: () => Promise<void>;
  isLogsOpen: boolean;
  setLogsOpen: (open: boolean) => void;
  wsMessages: any[];
  lastMessage: any;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLogsOpen, setLogsOpen] = useState(false);
  const [wsMessages, setWsMessages] = useState<any[]>([]);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setLastMessage(msg);
        setWsMessages(prev => [...prev.slice(-100), msg]);

        if (msg.type === "job_update" || msg.type === "job_progress") {
          setJobs(prev => {
            const existing = prev.findIndex(j => j.id === msg.data.jobId || j.id === msg.data.id);
            if (existing >= 0) {
              const updated = [...prev];
              if (msg.type === "job_progress") {
                updated[existing] = { ...updated[existing], progress: msg.data.progress, status: "running" };
              } else {
                updated[existing] = msg.data;
              }
              return updated;
            }
            if (msg.type === "job_update") {
              return [msg.data, ...prev];
            }
            return prev;
          });
        }
      } catch {}
    };

    ws.onopen = () => {
      refreshJobs();
      refreshLogs();
    };

    ws.onclose = () => {
      setTimeout(() => {
        // reconnect handled by page refresh for simplicity
      }, 3000);
    };

    return () => ws.close();
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) setJobs(await res.json());
    } catch {}
  }, []);

  const refreshLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/logs");
      if (res.ok) setLogs(await res.json());
    } catch {}
  }, []);

  const cancelJob = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
      if (res.ok) {
        const updated = await res.json();
        setJobs(prev => prev.map(j => j.id === id ? updated : j));
      }
    } catch {}
  }, []);

  const clearLogs = useCallback(async () => {
    try {
      await fetch("/api/logs", { method: "DELETE" });
      setLogs([]);
    } catch {}
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshLogs]);

  return (
    <AppContext.Provider value={{ jobs, logs, refreshJobs, refreshLogs, cancelJob, clearLogs, isLogsOpen, setLogsOpen, wsMessages, lastMessage }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};

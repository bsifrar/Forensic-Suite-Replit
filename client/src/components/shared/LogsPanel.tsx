import { useAppContext } from "@/lib/store";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LogsPanel() {
  const { logs, isLogsOpen, setLogsOpen, clearLogs } = useAppContext();

  return (
    <Sheet open={isLogsOpen} onOpenChange={setLogsOpen}>
      <SheetContent className="w-[400px] sm:w-[540px] border-l border-white/10 glass-panel shadow-2xl p-0 flex flex-col">
        <SheetHeader className="p-6 border-b border-white/10 pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">System Logs</SheetTitle>
            <Button data-testid="button-clear-logs" variant="ghost" size="sm" onClick={clearLogs} className="h-8 text-muted-foreground hover:text-red-400">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        </SheetHeader>
        
        <ScrollArea className="flex-1 p-6 font-mono text-[11px] sm:text-xs">
          {logs.length === 0 ? (
            <div className="text-center text-muted-foreground mt-10">No logs captured.</div>
          ) : (
            <div className="flex flex-col gap-1.5 pb-8">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 py-1 border-b border-white/5 last:border-0">
                  <span className="text-muted-foreground shrink-0 w-16">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                  </span>
                  <span className={`shrink-0 uppercase font-semibold w-12 ${
                    log.level === 'info' ? 'text-blue-400' :
                    log.level === 'warn' ? 'text-yellow-400' :
                    log.level === 'error' ? 'text-red-400' : 'text-green-400'
                  }`}>
                    [{log.level}]
                  </span>
                  <span className="text-muted-foreground/60 shrink-0 w-24 truncate" title={log.module}>
                    {log.module}
                  </span>
                  <span className="text-white/80 break-words flex-1">
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

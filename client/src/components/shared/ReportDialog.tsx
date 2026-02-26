import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Download, Archive, Loader2 } from "lucide-react";
import { useAppContext } from "@/lib/store";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReportDialog({ open, onOpenChange }: ReportDialogProps) {
  const { addJob, addLog } = useAppContext();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    // Simulate API delay
    setTimeout(() => {
      setIsGenerating(false);
      onOpenChange(false);
      addJob({
        name: "Generate Forensic Report",
        type: "report_gen",
      });
      addLog("info", "Started compiling comprehensive HTML/PDF report into ZIP.", "ReportModule");
    }, 800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] glass-panel border-white/10 bg-black/60 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-blue-400" />
            Create Final Report
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Generate a downloadable ZIP package containing case summaries, filtered media evidence, and recovered artifacts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="case-number" className="text-white/80">Case Number / Reference</Label>
            <Input id="case-number" placeholder="e.g. 2023-F-1402" className="bg-black/40 border-white/10" />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="investigator" className="text-white/80">Investigator Name</Label>
            <Input id="investigator" placeholder="Jane Doe" className="bg-black/40 border-white/10" />
          </div>

          <div className="space-y-3">
            <Label className="text-white/80">Include in Archive</Label>
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center space-x-3 cursor-pointer group">
                <Checkbox id="inc-summary" defaultChecked className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                <span className="text-sm font-medium leading-none text-white/70 group-hover:text-white transition-colors">Executive Summary (HTML/PDF)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer group">
                <Checkbox id="inc-media" defaultChecked className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                <span className="text-sm font-medium leading-none text-white/70 group-hover:text-white transition-colors">Flagged Media (Suggestive/Sexy/Explicit)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer group">
                <Checkbox id="inc-sqlite" defaultChecked className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                <span className="text-sm font-medium leading-none text-white/70 group-hover:text-white transition-colors">Extracted SQLite DBs (SMS, AddressBook)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer group">
                <Checkbox id="inc-logs" className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                <span className="text-sm font-medium leading-none text-white/70 group-hover:text-white transition-colors">System Analysis Logs</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-white/5 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20">
            {isGenerating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Archive className="w-4 h-4 mr-2" />
            )}
            Compile & Queue Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Archive, Loader2 } from "lucide-react";
import { useAppContext } from "@/lib/store";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReportDialog({ open, onOpenChange }: ReportDialogProps) {
  const { lastMessage } = useAppContext();
  const [isGenerating, setIsGenerating] = useState(false);
  const [caseNumber, setCaseNumber] = useState("");
  const [investigator, setInvestigator] = useState("");
  const [agency, setAgency] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [chainOfCustody, setChainOfCustody] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split('T')[0]);
  const [classification, setClassification] = useState("internal");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeMedia, setIncludeMedia] = useState(true);
  const [includeSqlite, setIncludeSqlite] = useState(true);
  const [includeLogs, setIncludeLogs] = useState(false);
  const [includeBB, setIncludeBB] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          caseNumber, 
          investigator, 
          agency, 
          evidenceDescription, 
          chainOfCustody, 
          acquisitionDate, 
          classification, 
          includeSummary, 
          includeMedia, 
          includeSqlite, 
          includeLogs, 
          includeBB 
        }),
      });
      onOpenChange(false);
    } catch {}
    setIsGenerating(false);
  };

  if (lastMessage?.type === "report_ready" && lastMessage.data?.path) {
    window.open(lastMessage.data.path, "_blank");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] glass-panel border-white/10 bg-black/60 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-blue-400" />
            Create Final Report
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Generate a downloadable ZIP with case summaries, media classification results, and recovered artifacts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="case-number" className="text-white/80">Case Number</Label>
              <Input data-testid="input-case-number" id="case-number" placeholder="e.g. 2023-F-1402" className="bg-black/40 border-white/10" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="investigator" className="text-white/80">Investigator Name</Label>
              <Input data-testid="input-investigator" id="investigator" placeholder="Jane Doe" className="bg-black/40 border-white/10" value={investigator} onChange={(e) => setInvestigator(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="agency" className="text-white/80">Agency / Organization</Label>
              <Input data-testid="input-agency" id="agency" placeholder="Digital Forensics Unit" className="bg-black/40 border-white/10" value={agency} onChange={(e) => setAgency(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acquisition-date" className="text-white/80">Acquisition Date</Label>
              <Input data-testid="input-acquisition-date" id="acquisition-date" type="date" className="bg-black/40 border-white/10" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="classification" className="text-white/80">Report Classification</Label>
            <Select value={classification} onValueChange={setClassification}>
              <SelectTrigger id="classification" className="bg-black/40 border-white/10">
                <SelectValue placeholder="Select classification" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1b1e] border-white/10">
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal Use Only</SelectItem>
                <SelectItem value="confidential">Confidential / Law Enforcement Sensitive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="evidence-description" className="text-white/80">Evidence Description</Label>
            <Textarea 
              data-testid="input-evidence-description" 
              id="evidence-description" 
              placeholder="e.g. 1x iPhone 13, Serial #..." 
              className="bg-black/40 border-white/10 min-h-[80px]" 
              value={evidenceDescription} 
              onChange={(e) => setEvidenceDescription(e.target.value)} 
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="chain-of-custody" className="text-white/80">Chain of Custody Notes</Label>
            <Textarea 
              data-testid="input-chain-of-custody" 
              id="chain-of-custody" 
              placeholder="Collected from evidence locker #4..." 
              className="bg-black/40 border-white/10 min-h-[80px]" 
              value={chainOfCustody} 
              onChange={(e) => setChainOfCustody(e.target.value)} 
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-white/5">
            <Label className="text-white/80">Include in Archive</Label>
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center space-x-3 cursor-pointer group">
                <Checkbox checked={includeSummary} onCheckedChange={(c) => setIncludeSummary(!!c)} className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                <span className="text-sm font-medium leading-none text-white/70 group-hover:text-white transition-colors">Executive Summary (HTML)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer group">
                <Checkbox checked={includeMedia} onCheckedChange={(c) => setIncludeMedia(!!c)} className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                <span className="text-sm font-medium leading-none text-white/70 group-hover:text-white transition-colors">Media Classification CSV</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer group">
                <Checkbox checked={includeSqlite} onCheckedChange={(c) => setIncludeSqlite(!!c)} className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                <span className="text-sm font-medium leading-none text-white/70 group-hover:text-white transition-colors">Extracted SQLite Tables (CSV)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer group">
                <Checkbox checked={includeLogs} onCheckedChange={(c) => setIncludeLogs(!!c)} className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                <span className="text-sm font-medium leading-none text-white/70 group-hover:text-white transition-colors">System Analysis Logs</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer group">
                <Checkbox checked={includeBB} onCheckedChange={(c) => setIncludeBB(!!c)} className="border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                <span className="text-sm font-medium leading-none text-white/70 group-hover:text-white transition-colors">BlackBerry Forensics (REM, Key, Logs)</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-white/5 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </Button>
          <Button data-testid="button-generate-report" onClick={handleGenerate} disabled={isGenerating} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20">
            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
            Compile & Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

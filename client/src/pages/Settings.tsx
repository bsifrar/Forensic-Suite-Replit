import { useState } from "react";
import { Settings as SettingsIcon, Hash, FileText, Image as ImageIcon, Monitor, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  const [hashAlgorithm, setHashAlgorithm] = useState("sha256");
  const [minStringLength, setMinStringLength] = useState(4);
  const [includeVideos, setIncludeVideos] = useState(true);
  const [includeGifs, setIncludeGifs] = useState(true);
  const [recursiveScan, setRecursiveScan] = useState(true);
  const [exportFormat, setExportFormat] = useState("csv");
  const [compactMode, setCompactMode] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6 h-full max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 data-testid="text-settings-title" className="text-3xl font-bold text-white tracking-tight">Settings</h2>
          <p className="text-muted-foreground mt-1">Configure analysis parameters and UI preferences.</p>
        </div>
        <Button data-testid="button-save-settings" onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Save className="w-4 h-4 mr-2" />
          {saved ? "Saved" : "Save Settings"}
        </Button>
      </div>

      <Card className="border-white/10 glass-panel">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="w-4 h-4 text-blue-400" />
            Hash Algorithm
          </CardTitle>
          <CardDescription className="text-xs">Select the cryptographic hash used for file integrity verification and duplicate detection.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            {[
              { id: "md5", label: "MD5", desc: "128-bit, fast, not collision-resistant" },
              { id: "sha1", label: "SHA-1", desc: "160-bit, legacy standard" },
              { id: "sha256", label: "SHA-256", desc: "256-bit, forensic standard" },
            ].map(algo => (
              <button
                key={algo.id}
                data-testid={`button-hash-${algo.id}`}
                onClick={() => setHashAlgorithm(algo.id)}
                className={`flex-1 p-3 rounded-lg border transition-all text-left ${
                  hashAlgorithm === algo.id
                    ? "border-blue-500/50 bg-blue-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-white">{algo.label}</span>
                  {hashAlgorithm === algo.id && (
                    <Badge variant="outline" className="text-[9px] border-0 bg-blue-500/20 text-blue-300">Active</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{algo.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 glass-panel">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-green-400" />
            Media Scan Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {[
              { id: "includeVideos", label: "Include video files", desc: "MP4, AVI, MOV, MKV, WMV, FLV, WebM", checked: includeVideos, onChange: setIncludeVideos },
              { id: "includeGifs", label: "Include animated GIFs", desc: "Treat GIF files as scannable media", checked: includeGifs, onChange: setIncludeGifs },
              { id: "recursiveScan", label: "Recursive folder scan", desc: "Scan subdirectories within uploaded folders", checked: recursiveScan, onChange: setRecursiveScan },
            ].map(opt => (
              <label key={opt.id} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:border-white/20 transition-all">
                <div>
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                </div>
                <button
                  data-testid={`toggle-${opt.id}`}
                  onClick={() => opt.onChange(!opt.checked)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${opt.checked ? "bg-blue-600" : "bg-white/20"}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${opt.checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                </button>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 glass-panel">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-400" />
            Strings Extraction
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <Label className="text-sm text-white/80 whitespace-nowrap">Minimum string length</Label>
            <Input
              data-testid="input-min-string-length"
              type="number"
              min={1}
              max={256}
              value={minStringLength}
              onChange={(e) => setMinStringLength(parseInt(e.target.value) || 4)}
              className="bg-black/40 border-white/10 w-24"
            />
            <span className="text-xs text-muted-foreground">characters (default: 4)</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 glass-panel">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="w-4 h-4 text-amber-400" />
            Export & Display
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Label className="text-sm text-white/80 whitespace-nowrap">Export format</Label>
            <div className="flex gap-2">
              {["csv", "json"].map(fmt => (
                <button
                  key={fmt}
                  data-testid={`button-export-${fmt}`}
                  onClick={() => setExportFormat(fmt)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    exportFormat === fmt
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:border-white/20 transition-all">
            <div>
              <p className="text-sm font-medium text-white">Compact mode</p>
              <p className="text-[11px] text-muted-foreground">Reduce padding and font sizes for denser display</p>
            </div>
            <button
              data-testid="toggle-compactMode"
              onClick={() => setCompactMode(!compactMode)}
              className={`w-11 h-6 rounded-full transition-colors relative ${compactMode ? "bg-blue-600" : "bg-white/20"}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${compactMode ? "translate-x-[22px]" : "translate-x-0.5"}`} />
            </button>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}

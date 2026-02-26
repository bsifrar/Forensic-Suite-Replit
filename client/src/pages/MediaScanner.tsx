import { useState, useEffect, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/store";
import { UploadCloud, FolderOpen, Filter, Image as ImageIcon, EyeOff, Shield, AlertTriangle, Download, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface MediaItem {
  id: string;
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  category: string;
  hash?: string;
}

interface Stats {
  total: number;
  safe: number;
  suggestive: number;
  sexy: number;
  explicit: number;
}

export default function MediaScanner() {
  const { lastMessage } = useAppContext();
  const [activeTab, setActiveTab] = useState("all");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, safe: 0, suggestive: 0, sexy: 0, explicit: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMedia = useCallback(async (category?: string) => {
    try {
      const url = category && category !== "all" ? `/api/media?category=${category}` : "/api/media";
      const res = await fetch(url);
      if (res.ok) setMedia(await res.json());
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/media/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchMedia(activeTab);
    fetchStats();
  }, [activeTab, fetchMedia, fetchStats]);

  useEffect(() => {
    if (lastMessage?.type === "scan_complete") {
      fetchMedia(activeTab);
      fetchStats();
    }
  }, [lastMessage, activeTab, fetchMedia, fetchStats]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    formData.append("workspace", "media_scanner");

    try {
      await fetch("/api/upload", { method: "POST", body: formData });
    } catch {}
    setIsUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  };

  const handleExport = async () => {
    window.open("/api/media/export", "_blank");
  };

  const categories = [
    { id: "all", label: "All Media", count: stats.total, icon: <ImageIcon className="w-4 h-4" /> },
    { id: "safe", label: "Safe", count: stats.safe, icon: <Shield className="w-4 h-4 text-green-400" /> },
    { id: "suggestive", label: "Suggestive", count: stats.suggestive, icon: <EyeOff className="w-4 h-4 text-yellow-400" /> },
    { id: "sexy", label: "Sexy", count: stats.sexy, icon: <EyeOff className="w-4 h-4 text-orange-500" /> },
    { id: "explicit", label: "Explicit", count: stats.explicit, icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
  ];

  const hasScanned = stats.total > 0;

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-start justify-between">
        <div>
          <h2 data-testid="text-page-title" className="text-3xl font-bold text-white tracking-tight">Media Scanner Pro</h2>
          <p className="text-muted-foreground mt-1">Upload media files or ZIP archives for server-side classification.</p>
        </div>
        <div className="flex gap-2">
          <Button data-testid="button-export" variant="outline" className="border-white/10 glass-panel" onClick={handleExport} disabled={!hasScanned}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button data-testid="button-scan" onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white" disabled={isUploading}>
            {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderOpen className="w-4 h-4 mr-2" />}
            Upload & Scan
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,.zip"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {!hasScanned && (
        <Card
          data-testid="card-dropzone"
          className="border-white/10 glass-panel bg-white/5 border-dashed cursor-pointer"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
              {isUploading ? <Loader2 className="w-8 h-8 text-blue-500 animate-spin" /> : <UploadCloud className="w-8 h-8 text-blue-500" />}
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {isUploading ? "Uploading..." : "Drag and drop evidence files"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Drop files or a ZIP archive here to begin server-side classification into Safe, Suggestive, Sexy, and Explicit categories. All processing happens locally.
            </p>
            <Button variant="secondary" disabled={isUploading}>Browse Files</Button>
          </CardContent>
        </Card>
      )}

      {hasScanned && (
        <div className="grid grid-cols-5 gap-4">
          {categories.map(cat => (
            <Card key={cat.id} data-testid={`card-stat-${cat.id}`} className="border-white/10 glass-panel cursor-pointer hover:border-blue-500/30 transition-colors" onClick={() => setActiveTab(cat.id)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-white/5">
                    {cat.icon}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{cat.label}</p>
                    <p className="text-2xl font-bold text-white mt-0.5">{cat.count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasScanned && (
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); fetchMedia(v); }} className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-white/5 border border-white/10">
              {categories.map(cat => (
                <TabsTrigger key={cat.id} value={cat.id} className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
                  {cat.label}
                  <Badge variant="secondary" className="ml-2 bg-black/40 text-[10px] px-1.5 py-0">
                    {cat.count}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="flex-1 overflow-y-auto mt-0 pr-2">
            {media.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <p>No media in this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pb-10">
                {media.map((item) => (
                  <div key={item.id} data-testid={`card-media-${item.id}`} className="group relative aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors">
                    {item.mimeType.startsWith("image/") ? (
                      <img
                        src={`/api/media/file/${item.id}`}
                        alt={item.filename}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div className={`absolute inset-0 flex items-center justify-center ${item.mimeType.startsWith("image/") ? "hidden" : ""} opacity-30 group-hover:opacity-100 transition-opacity`}>
                      <ImageIcon className="w-8 h-8 text-white/50" />
                    </div>
                    <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
                      <span className="text-[10px] font-mono text-white/70 truncate max-w-[80px]" title={item.filename}>{item.filename}</span>
                      <Badge variant="outline" className={`text-[9px] px-1 border-0 ${
                        item.category === 'safe' ? 'bg-green-500/20 text-green-400' :
                        item.category === 'suggestive' ? 'bg-yellow-500/20 text-yellow-400' :
                        item.category === 'sexy' ? 'bg-orange-500/20 text-orange-400' :
                        item.category === 'explicit' ? 'bg-red-500/20 text-red-400' : ''
                      }`}>
                        {item.category}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

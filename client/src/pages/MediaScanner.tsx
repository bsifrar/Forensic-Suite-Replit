import { useState, useEffect, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/store";
import { UploadCloud, FolderOpen, Filter, Image as ImageIcon, EyeOff, Shield, AlertTriangle, Download, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import DropZone from "@/components/shared/DropZone";
import MediaDetailModal from "@/components/shared/MediaDetailModal";

interface MediaItem {
  id: string;
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  category: string;
  hash?: string;
  reasonTags?: string[];
  confidence?: number;
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
  const [scanTime, setScanTime] = useState<number | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePrevMedia = () => {
    if (!selectedMedia) return;
    const index = media.findIndex(m => m.id === selectedMedia.id);
    if (index > 0) setSelectedMedia(media[index - 1]);
    else setSelectedMedia(media[media.length - 1]);
  };

  const handleNextMedia = () => {
    if (!selectedMedia) return;
    const index = media.findIndex(m => m.id === selectedMedia.id);
    if (index < media.length - 1) setSelectedMedia(media[index + 1]);
    else setSelectedMedia(media[0]);
  };

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
      const startTime = Date.now();
      await fetch("/api/upload", { method: "POST", body: formData });
      const duration = (Date.now() - startTime) / 1000;
      setScanTime(duration);
    } catch {}
    setIsUploading(false);
  };

  const handleDropFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    formData.append("workspace", "media_scanner");
    try {
      const startTime = Date.now();
      await fetch("/api/upload", { method: "POST", body: formData });
      const duration = (Date.now() - startTime) / 1000;
      setScanTime(duration);
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
        <DropZone
          testId="card-dropzone"
          onFiles={handleDropFiles}
          icon={<UploadCloud className="w-10 h-10 text-blue-500" />}
          title="Drag and drop evidence files"
          description="Drop files, folders, or a ZIP archive here to begin server-side classification into Safe, Suggestive, Sexy, and Explicit categories. All processing happens locally."
          accept="image/*,video/*,.zip"
          loading={isUploading}
          loadingText="Uploading..."
          buttonText="Browse Files"
        />
      )}

      {hasScanned && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Category Distribution</span>
            <span className="text-white/60">
              {stats.total} files scanned {scanTime ? `in ${scanTime.toFixed(1)}s` : ""}
            </span>
          </div>
          <div className="h-4 w-full flex rounded-full overflow-hidden bg-white/5 border border-white/10">
            {categories.filter(c => c.id !== 'all').map(cat => {
              const percentage = stats.total > 0 ? (stats[cat.id as keyof Stats] / stats.total) * 100 : 0;
              if (percentage === 0) return null;
              
              const colorClass = 
                cat.id === 'safe' ? 'bg-green-500' :
                cat.id === 'suggestive' ? 'bg-yellow-500' :
                cat.id === 'sexy' ? 'bg-orange-500' :
                cat.id === 'explicit' ? 'bg-red-500' : 'bg-gray-500';

              return (
                <div 
                  key={cat.id}
                  style={{ width: `${percentage}%` }}
                  className={`${colorClass} h-full transition-all duration-500 relative group`}
                  title={`${cat.label}: ${percentage.toFixed(1)}%`}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-black opacity-0 group-hover:opacity-100 transition-opacity">
                    {percentage.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
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
                  <div 
                    key={item.id} 
                    data-testid={`card-media-${item.id}`} 
                    className="group relative aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedMedia(item);
                      setIsDetailOpen(true);
                    }}
                  >
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
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                      {item.reasonTags?.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-black/60 text-white border-white/20 text-[8px] py-0 px-1 backdrop-blur-sm">
                          {tag}
                        </Badge>
                      ))}
                      {item.confidence !== undefined && (
                        <Badge variant="outline" className="bg-blue-600/40 text-blue-100 border-blue-400/30 text-[8px] py-0 px-1 backdrop-blur-sm">
                          {item.confidence}%
                        </Badge>
                      )}
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

      <MediaDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        item={selectedMedia}
        onPrev={handlePrevMedia}
        onNext={handleNextMedia}
      />
    </div>
  );
}

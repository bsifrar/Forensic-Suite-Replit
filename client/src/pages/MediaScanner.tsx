import { useState, useEffect, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/store";
import { UploadCloud, FolderOpen, Image as ImageIcon, EyeOff, Shield, AlertTriangle, Download, Loader2, LayoutGrid, List, ArrowUpDown, Copy, Trash2, Video } from "lucide-react";
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

interface DuplicateGroup {
  hash: string;
  count: number;
  wastedBytes: number;
  files: MediaItem[];
}

type SortKey = "name-asc" | "name-desc" | "size-asc" | "size-desc" | "category";
type TypeFilter = "all" | "images" | "videos";
type ViewMode = "grid" | "list";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const categoryOrder: Record<string, number> = { explicit: 0, sexy: 1, suggestive: 2, safe: 3 };

export default function MediaScanner() {
  const { lastMessage } = useAppContext();
  const [activeTab, setActiveTab] = useState("all");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, safe: 0, suggestive: 0, sexy: 0, explicit: 0 });
  const [scanTime, setScanTime] = useState<number | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [dupStats, setDupStats] = useState({ totalDuplicates: 0, totalWasted: 0 });
  const [removingDups, setRemovingDups] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePrevMedia = () => {
    if (!selectedMedia) return;
    const sorted = sortedMedia;
    const index = sorted.findIndex(m => m.id === selectedMedia.id);
    if (index > 0) setSelectedMedia(sorted[index - 1]);
    else setSelectedMedia(sorted[sorted.length - 1]);
  };

  const handleNextMedia = () => {
    if (!selectedMedia) return;
    const sorted = sortedMedia;
    const index = sorted.findIndex(m => m.id === selectedMedia.id);
    if (index < sorted.length - 1) setSelectedMedia(sorted[index + 1]);
    else setSelectedMedia(sorted[0]);
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

  const fetchDuplicates = useCallback(async () => {
    try {
      const res = await fetch("/api/media/duplicates");
      if (res.ok) {
        const data = await res.json();
        setDuplicates(data.groups);
        setDupStats({ totalDuplicates: data.totalDuplicates, totalWasted: data.totalWasted });
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchMedia(activeTab === "duplicates" ? "all" : activeTab);
    fetchStats();
    fetchDuplicates();
  }, [activeTab, fetchMedia, fetchStats, fetchDuplicates]);

  useEffect(() => {
    if (lastMessage?.type === "scan_complete") {
      fetchMedia(activeTab === "duplicates" ? "all" : activeTab);
      fetchStats();
      fetchDuplicates();
    }
  }, [lastMessage, activeTab, fetchMedia, fetchStats, fetchDuplicates]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append("files", files[i]);
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

  const handleExport = async () => {
    window.open("/api/media/export", "_blank");
  };

  const handleRemoveDuplicates = async () => {
    setRemovingDups(true);
    try {
      await fetch("/api/media/duplicates/remove", { method: "POST" });
      await fetchMedia(activeTab === "duplicates" ? "all" : activeTab);
      await fetchStats();
      await fetchDuplicates();
    } catch {}
    setRemovingDups(false);
  };

  const filteredMedia = media.filter(item => {
    if (typeFilter === "images") return item.mimeType.startsWith("image/");
    if (typeFilter === "videos") return item.mimeType.startsWith("video/");
    return true;
  });

  const sortedMedia = [...filteredMedia].sort((a, b) => {
    switch (sortKey) {
      case "name-asc": return a.filename.localeCompare(b.filename);
      case "name-desc": return b.filename.localeCompare(a.filename);
      case "size-asc": return a.size - b.size;
      case "size-desc": return b.size - a.size;
      case "category": return (categoryOrder[a.category] ?? 9) - (categoryOrder[b.category] ?? 9);
      default: return 0;
    }
  });

  const categories = [
    { id: "all", label: "All Media", count: stats.total, icon: <ImageIcon className="w-4 h-4" /> },
    { id: "safe", label: "Safe", count: stats.safe, icon: <Shield className="w-4 h-4 text-green-400" /> },
    { id: "suggestive", label: "Suggestive", count: stats.suggestive, icon: <EyeOff className="w-4 h-4 text-yellow-400" /> },
    { id: "sexy", label: "Sexy", count: stats.sexy, icon: <EyeOff className="w-4 h-4 text-orange-500" /> },
    { id: "explicit", label: "Explicit", count: stats.explicit, icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
  ];

  const hasScanned = stats.total > 0;

  const categoryBadgeClass = (cat: string) =>
    cat === "safe" ? "bg-green-500/20 text-green-400" :
    cat === "suggestive" ? "bg-yellow-500/20 text-yellow-400" :
    cat === "sexy" ? "bg-orange-500/20 text-orange-400" :
    cat === "explicit" ? "bg-red-500/20 text-red-400" : "";

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
            {categories.filter(c => c.id !== "all").map(cat => {
              const percentage = stats.total > 0 ? ((stats[cat.id as keyof Stats] as number) / stats.total) * 100 : 0;
              if (percentage === 0) return null;
              const colorClass =
                cat.id === "safe" ? "bg-green-500" :
                cat.id === "suggestive" ? "bg-yellow-500" :
                cat.id === "sexy" ? "bg-orange-500" :
                cat.id === "explicit" ? "bg-red-500" : "bg-gray-500";
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
                    <div className="p-2 rounded-md bg-white/5">{cat.icon}</div>
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
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v !== "duplicates") fetchMedia(v); }} className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4 gap-4">
            <TabsList className="bg-white/5 border border-white/10">
              {categories.map(cat => (
                <TabsTrigger key={cat.id} value={cat.id} className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
                  {cat.label}
                  <Badge variant="secondary" className="ml-2 bg-black/40 text-[10px] px-1.5 py-0">{cat.count}</Badge>
                </TabsTrigger>
              ))}
              <TabsTrigger value="duplicates" className="data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-400">
                <Copy className="w-3 h-3 mr-1" />
                Duplicates
                {dupStats.totalDuplicates > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-purple-500/20 text-purple-300 text-[10px] px-1.5 py-0">{dupStats.totalDuplicates}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {activeTab !== "duplicates" && (
              <div className="flex items-center gap-2">
                <select
                  data-testid="select-type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                  className="h-8 rounded-md bg-white/5 border border-white/10 text-xs text-white px-2 focus:outline-none focus:border-blue-500/50"
                >
                  <option value="all">All Types</option>
                  <option value="images">Images Only</option>
                  <option value="videos">Videos Only</option>
                </select>
                <select
                  data-testid="select-sort"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="h-8 rounded-md bg-white/5 border border-white/10 text-xs text-white px-2 focus:outline-none focus:border-blue-500/50"
                >
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                  <option value="size-desc">Size (Largest)</option>
                  <option value="size-asc">Size (Smallest)</option>
                  <option value="category">Category</option>
                </select>
                <div className="flex border border-white/10 rounded-md overflow-hidden">
                  <button
                    data-testid="button-view-grid"
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-blue-600/20 text-blue-400" : "bg-white/5 text-muted-foreground hover:text-white"}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    data-testid="button-view-list"
                    onClick={() => setViewMode("list")}
                    className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-blue-600/20 text-blue-400" : "bg-white/5 text-muted-foreground hover:text-white"}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {activeTab === "duplicates" ? (
            <TabsContent value="duplicates" className="flex-1 overflow-y-auto mt-0 pr-2">
              {duplicates.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <Copy className="w-8 h-8 mb-2 opacity-40" />
                  <p>No duplicate files detected.</p>
                </div>
              ) : (
                <div className="space-y-4 pb-10">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <span className="text-purple-400 font-semibold">{dupStats.totalDuplicates}</span> duplicate files wasting{" "}
                      <span className="text-purple-400 font-semibold">{formatBytes(dupStats.totalWasted)}</span>
                    </div>
                    <Button
                      data-testid="button-remove-duplicates"
                      variant="destructive"
                      size="sm"
                      onClick={handleRemoveDuplicates}
                      disabled={removingDups}
                      className="bg-red-600/80 hover:bg-red-600"
                    >
                      {removingDups ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                      Remove Duplicates
                    </Button>
                  </div>
                  {duplicates.map((group) => (
                    <Card key={group.hash} className="border-white/10 glass-panel">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                              {group.count} copies
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">SHA-256: {group.hash.slice(0, 16)}...</span>
                          </div>
                          <span className="text-xs text-red-400">{formatBytes(group.wastedBytes)} wasted</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                          {group.files.map((file, idx) => (
                            <div
                              key={file.id}
                              data-testid={`card-dup-${file.id}`}
                              className={`relative aspect-square rounded-md overflow-hidden bg-white/5 border cursor-pointer hover:border-blue-500/50 transition-colors ${idx === 0 ? "border-green-500/40" : "border-white/10"}`}
                              onClick={() => { setSelectedMedia(file); setIsDetailOpen(true); }}
                            >
                              {file.mimeType.startsWith("image/") ? (
                                <img src={`/api/media/file/${file.id}`} alt={file.filename} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                                  <Video className="w-6 h-6 text-white/50" />
                                </div>
                              )}
                              <div className="absolute bottom-0 inset-x-0 p-1 bg-black/70 text-[9px] text-white/70 font-mono truncate">
                                {file.filename}
                              </div>
                              {idx === 0 && (
                                <Badge className="absolute top-1 right-1 bg-green-500/80 text-[8px] px-1 py-0 border-0">Keep</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ) : (
            <TabsContent value={activeTab} className="flex-1 overflow-y-auto mt-0 pr-2">
              {sortedMedia.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <p>No media in this category.</p>
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pb-10">
                  {sortedMedia.map((item) => (
                    <div
                      key={item.id}
                      data-testid={`card-media-${item.id}`}
                      className="group relative aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors cursor-pointer"
                      onClick={() => { setSelectedMedia(item); setIsDetailOpen(true); }}
                    >
                      {item.mimeType.startsWith("image/") ? (
                        <img
                          src={`/api/media/file/${item.id}`}
                          alt={item.filename}
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-60 transition-opacity">
                          <Video className="w-8 h-8 text-white/50" />
                        </div>
                      )}
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
                        <Badge variant="outline" className={`text-[9px] px-1 border-0 ${categoryBadgeClass(item.category)}`}>
                          {item.category}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-white/10 rounded-lg overflow-hidden pb-10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="text-left p-3 text-xs text-muted-foreground font-medium w-12"></th>
                        <th className="text-left p-3 text-xs text-muted-foreground font-medium">Filename</th>
                        <th className="text-left p-3 text-xs text-muted-foreground font-medium">Category</th>
                        <th className="text-left p-3 text-xs text-muted-foreground font-medium">Reason Tags</th>
                        <th className="text-right p-3 text-xs text-muted-foreground font-medium">Confidence</th>
                        <th className="text-right p-3 text-xs text-muted-foreground font-medium">Size</th>
                        <th className="text-left p-3 text-xs text-muted-foreground font-medium">Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMedia.map((item) => (
                        <tr
                          key={item.id}
                          data-testid={`row-media-${item.id}`}
                          className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                          onClick={() => { setSelectedMedia(item); setIsDetailOpen(true); }}
                        >
                          <td className="p-3">
                            <div className="w-8 h-8 rounded overflow-hidden bg-white/5">
                              {item.mimeType.startsWith("image/") ? (
                                <img src={`/api/media/file/${item.id}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Video className="w-4 h-4 text-white/30" />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-white/90 font-mono text-xs truncate max-w-[200px]" title={item.filename}>{item.filename}</td>
                          <td className="p-3">
                            <Badge variant="outline" className={`text-[10px] px-1.5 border-0 ${categoryBadgeClass(item.category)}`}>
                              {item.category}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1 flex-wrap">
                              {item.reasonTags?.map((tag, i) => (
                                <Badge key={i} variant="secondary" className="bg-white/10 text-white/70 text-[9px] py-0 px-1">{tag}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-right text-white/60 text-xs">{item.confidence !== undefined ? `${item.confidence}%` : "—"}</td>
                          <td className="p-3 text-right text-white/60 text-xs">{formatBytes(item.size)}</td>
                          <td className="p-3 text-white/40 font-mono text-[10px] truncate max-w-[100px]">{item.hash?.slice(0, 12) ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          )}
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

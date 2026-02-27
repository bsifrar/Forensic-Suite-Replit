import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, FileText, Image as ImageIcon, Video, Hash, File } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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

interface MediaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MediaItem | null;
  onPrev: () => void;
  onNext: () => void;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export default function MediaDetailModal({ isOpen, onClose, item, onPrev, onNext }: MediaDetailModalProps) {
  if (!item) return null;

  const isImage = item.mimeType.startsWith("image/");
  const isVideo = item.mimeType.startsWith("video/");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-[90vw] h-[90vh] p-0 flex flex-col bg-[#0a0a0b] border-white/10 overflow-hidden">
        <DialogHeader className="p-4 border-b border-white/10 flex flex-row items-center justify-between">
          <div className="flex flex-col">
            <DialogTitle data-testid="text-detail-filename" className="text-white truncate max-w-[400px]">
              {item.filename}
            </DialogTitle>
            <span className="text-xs text-muted-foreground truncate max-w-[400px]">{item.path}</span>
          </div>
          <div className="flex gap-2 mr-8">
            <Button data-testid="button-prev" variant="outline" size="icon" onClick={onPrev} className="border-white/10 bg-white/5">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button data-testid="button-next" variant="outline" size="icon" onClick={onNext} className="border-white/10 bg-white/5">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Main Preview Area */}
          <div className="flex-1 bg-black flex items-center justify-center relative group">
            {isImage ? (
              <img
                src={`/api/media/file/${item.id}`}
                alt={item.filename}
                className="max-w-full max-h-full object-contain"
                data-testid="img-detail-preview"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 text-muted-foreground">
                {isVideo ? <Video className="w-24 h-24" /> : <File className="w-24 h-24" />}
                <p className="text-lg font-medium">{isVideo ? "Video File" : "Binary File"}</p>
                <p className="text-sm">Preview not available</p>
              </div>
            )}
          </div>

          {/* Sidebar Info */}
          <div className="w-80 border-l border-white/10 bg-[#0a0a0b] flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Classification</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/70">Category</span>
                      <Badge data-testid={`status-category-${item.category}`} variant="outline" className={`border-0 ${
                        item.category === 'safe' ? 'bg-green-500/20 text-green-400' :
                        item.category === 'suggestive' ? 'bg-yellow-500/20 text-yellow-400' :
                        item.category === 'sexy' ? 'bg-orange-500/20 text-orange-400' :
                        item.category === 'explicit' ? 'bg-red-500/20 text-red-400' : ''
                      }`}>
                        {item.category.toUpperCase()}
                      </Badge>
                    </div>
                    {item.confidence !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/70">Confidence</span>
                        <span data-testid="text-detail-confidence" className="text-sm font-mono text-white">{item.confidence}%</span>
                      </div>
                    )}
                    {item.reasonTags && item.reasonTags.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-sm text-white/70 block">Reason Tags</span>
                        <div className="flex flex-wrap gap-1">
                          {item.reasonTags.map((tag, i) => (
                            <Badge key={i} data-testid={`badge-reason-${tag}`} variant="secondary" className="bg-white/5 text-[10px] text-white/70 border-white/10">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">File Information</h3>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-white/70">
                        <FileText className="w-3.5 h-3.5" />
                        <span className="text-sm">MIME Type</span>
                      </div>
                      <span data-testid="text-detail-mime" className="text-xs font-mono text-white/50 pl-5.5">{item.mimeType}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-white/70">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span className="text-sm">File Size</span>
                      </div>
                      <span data-testid="text-detail-size" className="text-xs font-mono text-white/50 pl-5.5">{formatSize(item.size)}</span>
                    </div>
                    {item.hash && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-white/70">
                          <Hash className="w-3.5 h-3.5" />
                          <span className="text-sm">SHA-256 Hash</span>
                        </div>
                        <span data-testid="text-detail-hash" className="text-[10px] font-mono text-white/50 break-all pl-5.5">{item.hash}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <div className="pt-2">
                  <Button variant="outline" className="w-full border-white/10 bg-white/5 hover:bg-white/10 text-white" asChild>
                    <a href={`/api/media/file/${item.id}`} download={item.filename}>
                      <Download className="w-4 h-4 mr-2" />
                      Download Original
                    </a>
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

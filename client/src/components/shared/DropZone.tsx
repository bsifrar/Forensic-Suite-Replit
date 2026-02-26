import { useState, useCallback, useRef } from "react";
import { Upload, Loader2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  icon?: React.ReactNode;
  title: string;
  description: string;
  subtitle?: string;
  accept?: string;
  multiple?: boolean;
  loading?: boolean;
  loadingText?: string;
  buttonText?: string;
  buttonClassName?: string;
  error?: string | null;
  children?: React.ReactNode;
  className?: string;
  testId?: string;
}

async function getAllFileEntries(dataTransferItemList: DataTransferItemList): Promise<File[]> {
  const files: File[] = [];
  const entries: FileSystemEntry[] = [];

  for (let i = 0; i < dataTransferItemList.length; i++) {
    const entry = dataTransferItemList[i].webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry);
    } else {
      const file = dataTransferItemList[i].getAsFile();
      if (file) files.push(file);
    }
  }

  async function traverseEntry(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const dirEntries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        const allEntries: FileSystemEntry[] = [];
        function readBatch() {
          reader.readEntries((batch) => {
            if (batch.length === 0) {
              resolve(allEntries);
            } else {
              allEntries.push(...batch);
              readBatch();
            }
          }, reject);
        }
        readBatch();
      });
      for (const dirEntry of dirEntries) {
        await traverseEntry(dirEntry);
      }
    }
  }

  for (const entry of entries) {
    await traverseEntry(entry);
  }

  return files;
}

export default function DropZone({
  onFiles,
  icon,
  title,
  description,
  subtitle,
  accept,
  multiple = true,
  loading = false,
  loadingText = "Processing...",
  buttonText = "Browse Files",
  buttonClassName = "bg-blue-600 hover:bg-blue-700 text-white",
  error,
  children,
  className = "",
  testId,
}: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);

    if (loading) return;

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const files = await getAllFileEntries(items);
      if (files.length > 0) {
        onFiles(files);
      }
    } else if (e.dataTransfer.files.length > 0) {
      onFiles(Array.from(e.dataTransfer.files));
    }
  }, [onFiles, loading]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  }, [onFiles]);

  return (
    <div
      data-testid={testId}
      className={`
        relative flex flex-col items-center justify-center py-16 rounded-xl
        border-2 border-dashed transition-all duration-200 cursor-pointer
        ${isDragOver
          ? "border-blue-400 bg-blue-500/10 scale-[1.01]"
          : "border-white/10 hover:border-white/20 bg-white/[0.02]"
        }
        ${loading ? "pointer-events-none opacity-70" : ""}
        ${className}
      `}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => !loading && inputRef.current?.click()}
    >
      {isDragOver && (
        <div className="absolute inset-0 rounded-xl bg-blue-500/5 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <FolderOpen className="w-12 h-12 text-blue-400 animate-bounce" />
            <p className="text-blue-400 font-semibold text-lg">Drop files here</p>
          </div>
        </div>
      )}

      <div className={`flex flex-col items-center ${isDragOver ? "opacity-20" : ""}`}>
        {icon && (
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
            {icon}
          </div>
        )}

        <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
        <p className="text-muted-foreground max-w-lg text-center mb-2">{description}</p>
        {subtitle && <p className="text-xs text-muted-foreground/60 mb-4">{subtitle}</p>}

        {error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {children}

        <Button
          className={`px-8 py-3 text-base mt-2 ${buttonClassName}`}
          disabled={loading}
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        >
          {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Upload className="w-5 h-5 mr-2" />}
          {loading ? loadingText : buttonText}
        </Button>

        <p className="text-[11px] text-muted-foreground/40 mt-4">
          Drag & drop files, folders, or ZIP archives anywhere in this area
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}

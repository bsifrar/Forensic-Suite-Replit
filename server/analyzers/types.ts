export interface AnalyzerResult<T = any> {
  success: boolean;
  data: T;
  error?: string;
  duration?: number;
}

export type ProgressCallback = (pct: number, msg: string) => void;

export type FileProgressCallback = (data: {
  currentFile: string;
  fileIndex: number;
  totalFiles: number;
}) => void;

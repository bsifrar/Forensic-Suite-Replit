import { z } from "zod";

export const JobStatusEnum = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof JobStatusEnum>;

export const JobTypeEnum = z.enum(["media_scan", "keyword_search", "sqlite_explore", "plist_parse", "strings_extract", "media_carve", "archive_extract", "report_gen", "backup_detect"]);
export type JobType = z.infer<typeof JobTypeEnum>;

export const MediaCategoryEnum = z.enum(["safe", "suggestive", "sexy", "explicit"]);
export type MediaCategory = z.infer<typeof MediaCategoryEnum>;

export interface Job {
  id: string;
  name: string;
  type: JobType;
  progress: number;
  status: JobStatus;
  startTime: string;
  result?: any;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  module: string;
}

export interface ScannedMedia {
  id: string;
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  category: MediaCategory;
  width?: number;
  height?: number;
  hash?: string;
}

export interface KeywordHit {
  id: string;
  file: string;
  offset: number;
  context: string;
  matchType: "text" | "hex";
  query: string;
}

export interface SqliteTableInfo {
  name: string;
  rowCount: number;
  columns: { name: string; type: string }[];
}

export interface PlistEntry {
  key: string;
  type: string;
  value: any;
}

export interface ExtractedString {
  offset: number;
  value: string;
  encoding: "ascii" | "utf8" | "utf16";
}

export interface CarvedFile {
  id: string;
  type: "jpg" | "png";
  offset: number;
  size: number;
  filename: string;
}

export interface DetectedBackup {
  id: string;
  type: "apple_mobilesync" | "blackberry_rem" | "blackberry_ipd" | "blackberry_bbb";
  path: string;
  size: number;
  files: number;
  modified: string;
}

export const uploadSchema = z.object({
  workspace: z.enum(["media_scanner", "artifact_analyzer"]),
});

export const keywordSearchSchema = z.object({
  query: z.string().min(1),
  matchType: z.enum(["text", "hex"]).default("text"),
  caseSensitive: z.boolean().default(false),
  searchInZips: z.boolean().default(false),
});

export const stringsExtractSchema = z.object({
  fileId: z.string().optional(),
  minLength: z.number().min(1).max(256).default(4),
});

export const reportSchema = z.object({
  caseNumber: z.string().optional(),
  investigator: z.string().optional(),
  includeSummary: z.boolean().default(true),
  includeMedia: z.boolean().default(true),
  includeSqlite: z.boolean().default(true),
  includeLogs: z.boolean().default(false),
});

export type User = { id: string; username: string; password: string };
export type InsertUser = { username: string; password: string };

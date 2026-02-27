import { randomUUID } from "crypto";
import type { Job, LogEntry, ScannedMedia, KeywordHit, DetectedBackup, CarvedFile, ExtractedString, SqliteTableInfo, JobStatus, AppSettings } from "@shared/schema";

export interface IStorage {
  createJob(name: string, type: Job["type"], params?: Record<string, any>): Job;
  getJob(id: string): Job | undefined;
  getAllJobs(): Job[];
  updateJob(id: string, updates: Partial<Job>): Job | undefined;
  cancelJob(id: string): Job | undefined;

  addLog(level: LogEntry["level"], message: string, module: string): LogEntry;
  getLogs(): LogEntry[];
  clearLogs(): void;

  addScannedMedia(media: Omit<ScannedMedia, "id">): ScannedMedia;
  getScannedMedia(category?: string): ScannedMedia[];
  removeScannedMedia(id: string): boolean;
  clearScannedMedia(): void;

  addKeywordHit(hit: Omit<KeywordHit, "id">): KeywordHit;
  getKeywordHits(query?: string): KeywordHit[];

  addDetectedBackup(backup: Omit<DetectedBackup, "id">): DetectedBackup;
  getDetectedBackups(): DetectedBackup[];

  addCarvedFile(file: Omit<CarvedFile, "id">): CarvedFile;
  getCarvedFiles(): CarvedFile[];

  setExtractedStrings(strings: ExtractedString[]): void;
  getExtractedStrings(): ExtractedString[];

  setSqliteTables(tables: SqliteTableInfo[]): void;
  getSqliteTables(): SqliteTableInfo[];
  setSqliteRows(tableName: string, rows: any[]): void;
  getSqliteRows(tableName: string): any[];

  setPlistData(data: any): void;
  getPlistData(): any;

  getSettings(): AppSettings;
  updateSettings(updates: Partial<AppSettings>): AppSettings;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, Job> = new Map();
  private logs: LogEntry[] = [];
  private scannedMedia: Map<string, ScannedMedia> = new Map();
  private keywordHits: KeywordHit[] = [];
  private detectedBackups: Map<string, DetectedBackup> = new Map();
  private carvedFiles: Map<string, CarvedFile> = new Map();
  private extractedStrings: ExtractedString[] = [];
  private sqliteTables: SqliteTableInfo[] = [];
  private sqliteRowsMap: Map<string, any[]> = new Map();
  private plistData: any = null;
  private settings: AppSettings = {
    hashAlgorithm: "sha256",
    minStringLength: 4,
    includeVideos: true,
    includeGifs: true,
    recursiveScan: true,
    exportFormat: "csv",
    compactMode: false,
  };

  createJob(name: string, type: Job["type"], params?: Record<string, any>): Job {
    const job: Job = {
      id: randomUUID(),
      name,
      type,
      progress: 0,
      status: "pending",
      startTime: new Date().toISOString(),
      params,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values()).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  updateJob(id: string, updates: Partial<Job>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const updated = { ...job, ...updates };
    this.jobs.set(id, updated);
    return updated;
  }

  cancelJob(id: string): Job | undefined {
    return this.updateJob(id, { status: "cancelled" });
  }

  addLog(level: LogEntry["level"], message: string, module: string): LogEntry {
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      module,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 500) this.logs.pop();
    return entry;
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  clearLogs(): void {
    this.logs = [];
  }

  addScannedMedia(media: Omit<ScannedMedia, "id">): ScannedMedia {
    const item: ScannedMedia = { ...media, id: randomUUID() };
    this.scannedMedia.set(item.id, item);
    return item;
  }

  getScannedMedia(category?: string): ScannedMedia[] {
    const all = Array.from(this.scannedMedia.values());
    if (!category || category === "all") return all;
    return all.filter((m) => m.category === category);
  }

  removeScannedMedia(id: string): boolean {
    return this.scannedMedia.delete(id);
  }

  clearScannedMedia(): void {
    this.scannedMedia.clear();
  }

  addKeywordHit(hit: Omit<KeywordHit, "id">): KeywordHit {
    const item: KeywordHit = { ...hit, id: randomUUID() };
    this.keywordHits.push(item);
    return item;
  }

  getKeywordHits(query?: string): KeywordHit[] {
    if (!query) return this.keywordHits;
    return this.keywordHits.filter((h) => h.query === query);
  }

  addDetectedBackup(backup: Omit<DetectedBackup, "id">): DetectedBackup {
    const item: DetectedBackup = { ...backup, id: randomUUID() };
    this.detectedBackups.set(item.id, item);
    return item;
  }

  getDetectedBackups(): DetectedBackup[] {
    return Array.from(this.detectedBackups.values());
  }

  addCarvedFile(file: Omit<CarvedFile, "id">): CarvedFile {
    const item: CarvedFile = { ...file, id: randomUUID() };
    this.carvedFiles.set(item.id, item);
    return item;
  }

  getCarvedFiles(): CarvedFile[] {
    return Array.from(this.carvedFiles.values());
  }

  setExtractedStrings(strings: ExtractedString[]): void {
    this.extractedStrings = strings;
  }

  getExtractedStrings(): ExtractedString[] {
    return this.extractedStrings;
  }

  setSqliteTables(tables: SqliteTableInfo[]): void {
    this.sqliteTables = tables;
  }

  getSqliteTables(): SqliteTableInfo[] {
    return this.sqliteTables;
  }

  setSqliteRows(tableName: string, rows: any[]): void {
    this.sqliteRowsMap.set(tableName, rows);
  }

  getSqliteRows(tableName: string): any[] {
    return this.sqliteRowsMap.get(tableName) || [];
  }

  setPlistData(data: any): void {
    this.plistData = data;
  }

  getPlistData(): any {
    return this.plistData;
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...updates };
    return { ...this.settings };
  }
}

export const storage = new MemStorage();

import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { keywordSearchSchema, stringsExtractSchema, reportSchema } from "@shared/schema";
import { settingsSchema } from "@shared/schema";
import { getSignatures, getEnabledSignatures, setSignatureEnabled } from "./analyzers";
import {
  getUploadDir,
  getOutputDir,
  scanMediaFiles,
  keywordSearch,
  exploreSqlite,
  parsePlist,
  extractStrings,
  carveMedia,
  extractArchive,
  detectBackups,
  generateReport,
  generateHexDump,
} from "./processors";
import { analyzeBBBackup, decryptRemFile, type BBAnalysisResult } from "./bbAnalyzer";

export let bbAnalysisResults: Map<string, BBAnalysisResult & { dirPath: string }> = new Map();

const upload = multer({
  dest: path.join(getUploadDir(), "tmp"),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

let wss: WebSocketServer;
const wsClients = new Set<WebSocket>();

function broadcast(type: string, data: any) {
  const msg = JSON.stringify({ type, data });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function makeProgressFn(jobId: string) {
  return (progress: number, message: string) => {
    storage.updateJob(jobId, { progress, status: "running" });
    broadcast("job_progress", { jobId, progress, message });
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.on("close", () => wsClients.delete(ws));
    ws.send(JSON.stringify({ type: "connected", data: { message: "JuiceSuite Engine connected" } }));
  });

  // --- Jobs ---
  app.get("/api/jobs", (_req, res) => {
    res.json(storage.getAllJobs());
  });

  app.post("/api/jobs/:id/cancel", (req, res) => {
    const job = storage.cancelJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    storage.addLog("warn", `Cancelled job: ${job.name}`, "JobQueue");
    broadcast("job_update", job);
    res.json(job);
  });

  // --- Logs ---
  app.get("/api/logs", (_req, res) => {
    res.json(storage.getLogs());
  });

  app.delete("/api/logs", (_req, res) => {
    storage.clearLogs();
    res.json({ ok: true });
  });

  // --- File Upload ---
  app.post("/api/upload", upload.array("files", 100), (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const workspace = req.body.workspace || "media_scanner";
    const uploadDir = path.join(getUploadDir(), workspace, Date.now().toString());
    fs.mkdirSync(uploadDir, { recursive: true });

    const movedFiles: string[] = [];
    for (const file of files) {
      const dest = path.join(uploadDir, file.originalname);
      fs.renameSync(file.path, dest);
      movedFiles.push(dest);
    }

    storage.addLog("info", `Uploaded ${files.length} file(s) to ${workspace}`, "Upload");
    broadcast("upload_complete", { workspace, fileCount: files.length, dir: uploadDir });

    if (workspace === "media_scanner") {
      const ext = path.extname(movedFiles[0]).toLowerCase();
      if (ext === ".zip" && movedFiles.length === 1) {
        const job = storage.createJob(`Extract & Scan: ${files[0].originalname}`, "media_scan");
        broadcast("job_update", job);
        (async () => {
          try {
            storage.updateJob(job.id, { status: "running" });
            const progressFn = makeProgressFn(job.id);
            progressFn(5, "Extracting archive...");
            await extractArchive(movedFiles[0], progressFn);
            const extractedDir = path.join(getOutputDir(), fs.readdirSync(getOutputDir()).find(d => d.startsWith("extracted_")) || "");
            const scanDir = fs.existsSync(extractedDir) ? extractedDir : uploadDir;
            await scanMediaFiles(scanDir, progressFn, (fp) => {
              broadcast("scan_file_progress", { jobId: job.id, ...fp });
            });
            storage.updateJob(job.id, { status: "completed", progress: 100 });
            storage.addLog("success", `Completed scan: ${files[0].originalname}`, "MediaScanner");
            broadcast("job_update", storage.getJob(job.id));
            broadcast("scan_complete", { media: storage.getScannedMedia() });
          } catch (e: any) {
            storage.updateJob(job.id, { status: "failed", errorMessage: e.message });
            storage.addLog("error", `Scan failed: ${e.message}`, "MediaScanner");
            broadcast("job_update", storage.getJob(job.id));
          }
        })();
      } else {
        const job = storage.createJob(`Scan ${files.length} files`, "media_scan");
        broadcast("job_update", job);
        (async () => {
          try {
            storage.updateJob(job.id, { status: "running" });
            await scanMediaFiles(uploadDir, makeProgressFn(job.id), (fp) => {
              broadcast("scan_file_progress", { jobId: job.id, ...fp });
            });
            storage.updateJob(job.id, { status: "completed", progress: 100 });
            storage.addLog("success", `Scanned ${files.length} files`, "MediaScanner");
            broadcast("job_update", storage.getJob(job.id));
            broadcast("scan_complete", { media: storage.getScannedMedia() });
          } catch (e: any) {
            storage.updateJob(job.id, { status: "failed", errorMessage: e.message });
            storage.addLog("error", `Scan failed: ${e.message}`, "MediaScanner");
            broadcast("job_update", storage.getJob(job.id));
          }
        })();
      }
    }

    if (workspace === "artifact_analyzer") {
      const job = storage.createJob(`Detect backups in upload`, "backup_detect");
      broadcast("job_update", job);
      (async () => {
        try {
          storage.updateJob(job.id, { status: "running" });
          detectBackups(uploadDir, makeProgressFn(job.id));
          storage.updateJob(job.id, { status: "completed", progress: 100 });
          broadcast("job_update", storage.getJob(job.id));
          broadcast("backups_detected", { backups: storage.getDetectedBackups() });
        } catch (e: any) {
          storage.updateJob(job.id, { status: "failed" });
          broadcast("job_update", storage.getJob(job.id));
        }
      })();
    }

    res.json({ ok: true, dir: uploadDir, fileCount: files.length });
  });

  // --- Media Scanner ---
  app.get("/api/media", (req, res) => {
    const category = req.query.category as string | undefined;
    res.json(storage.getScannedMedia(category));
  });

  app.get("/api/media/stats", (_req, res) => {
    const all = storage.getScannedMedia();
    res.json({
      total: all.length,
      safe: all.filter(m => m.category === "safe").length,
      suggestive: all.filter(m => m.category === "suggestive").length,
      sexy: all.filter(m => m.category === "sexy").length,
      explicit: all.filter(m => m.category === "explicit").length,
    });
  });

  // --- Keyword Search ---
  app.post("/api/search", async (req, res) => {
    const parsed = keywordSearchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { query, matchType, caseSensitive, searchInZips } = parsed.data;
    const job = storage.createJob(`Search: ${query}`, "keyword_search");
    broadcast("job_update", job);
    res.json({ jobId: job.id });

    (async () => {
      try {
        storage.updateJob(job.id, { status: "running" });
        await keywordSearch(getUploadDir(), query, matchType, caseSensitive, searchInZips, makeProgressFn(job.id));
        storage.updateJob(job.id, { status: "completed", progress: 100 });
        storage.addLog("success", `Search completed for: ${query}`, "KeywordSearch");
        broadcast("job_update", storage.getJob(job.id));
        broadcast("search_complete", { hits: storage.getKeywordHits(query) });
      } catch (e: any) {
        storage.updateJob(job.id, { status: "failed" });
        storage.addLog("error", `Search failed: ${e.message}`, "KeywordSearch");
        broadcast("job_update", storage.getJob(job.id));
      }
    })();
  });

  app.get("/api/search/hits", (req, res) => {
    const query = req.query.query as string | undefined;
    res.json(storage.getKeywordHits(query));
  });

  // --- SQLite Explorer ---
  app.post("/api/sqlite/explore", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No SQLite file provided" });

    const dest = path.join(getUploadDir(), "sqlite", file.originalname);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file.path, dest);

    const job = storage.createJob(`SQLite: ${file.originalname}`, "sqlite_explore");
    broadcast("job_update", job);
    res.json({ jobId: job.id });

    (async () => {
      try {
        storage.updateJob(job.id, { status: "running" });
        await exploreSqlite(dest, makeProgressFn(job.id));
        storage.updateJob(job.id, { status: "completed", progress: 100 });
        storage.addLog("success", `SQLite parsed: ${file.originalname}`, "SQLiteExplorer");
        broadcast("job_update", storage.getJob(job.id));
        broadcast("sqlite_ready", { tables: storage.getSqliteTables() });
      } catch (e: any) {
        storage.updateJob(job.id, { status: "failed" });
        storage.addLog("error", `SQLite parse failed: ${e.message}`, "SQLiteExplorer");
        broadcast("job_update", storage.getJob(job.id));
      }
    })();
  });

  app.get("/api/sqlite/tables", (_req, res) => {
    res.json(storage.getSqliteTables());
  });

  app.get("/api/sqlite/rows/:table", (req, res) => {
    res.json(storage.getSqliteRows(req.params.table));
  });

  // --- Plist Viewer ---
  app.post("/api/plist/parse", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No plist file provided" });

    const dest = path.join(getUploadDir(), "plist", file.originalname);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file.path, dest);

    const job = storage.createJob(`Plist: ${file.originalname}`, "plist_parse");
    broadcast("job_update", job);
    res.json({ jobId: job.id });

    (async () => {
      try {
        storage.updateJob(job.id, { status: "running" });
        await parsePlist(dest, makeProgressFn(job.id));
        storage.updateJob(job.id, { status: "completed", progress: 100 });
        storage.addLog("success", `Plist parsed: ${file.originalname}`, "PlistViewer");
        broadcast("job_update", storage.getJob(job.id));
        broadcast("plist_ready", { data: storage.getPlistData() });
      } catch (e: any) {
        storage.updateJob(job.id, { status: "failed" });
        storage.addLog("error", `Plist parse failed: ${e.message}`, "PlistViewer");
        broadcast("job_update", storage.getJob(job.id));
      }
    })();
  });

  app.get("/api/plist/data", (_req, res) => {
    res.json(storage.getPlistData());
  });

  // --- Strings Extraction ---
  app.post("/api/strings/extract", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const minLength = parseInt(req.body.minLength) || 4;
    const dest = path.join(getUploadDir(), "strings", file.originalname);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file.path, dest);

    const job = storage.createJob(`Strings: ${file.originalname}`, "strings_extract");
    broadcast("job_update", job);
    res.json({ jobId: job.id });

    (async () => {
      try {
        storage.updateJob(job.id, { status: "running" });
        await extractStrings(dest, minLength, makeProgressFn(job.id));
        storage.updateJob(job.id, { status: "completed", progress: 100 });
        storage.addLog("success", `Strings extracted: ${file.originalname}`, "StringsExtractor");
        broadcast("job_update", storage.getJob(job.id));
        broadcast("strings_ready", { count: storage.getExtractedStrings().length });
      } catch (e: any) {
        storage.updateJob(job.id, { status: "failed" });
        storage.addLog("error", `Strings extraction failed: ${e.message}`, "StringsExtractor");
        broadcast("job_update", storage.getJob(job.id));
      }
    })();
  });

  app.get("/api/strings", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 200;
    const offset = parseInt(req.query.offset as string) || 0;
    const all = storage.getExtractedStrings();
    res.json({ total: all.length, strings: all.slice(offset, offset + limit) });
  });

  // --- Media Carving ---
  app.post("/api/carve", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const dest = path.join(getUploadDir(), "carve", file.originalname);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file.path, dest);

    const job = storage.createJob(`Carve: ${file.originalname}`, "media_carve");
    broadcast("job_update", job);
    res.json({ jobId: job.id });

    (async () => {
      try {
        storage.updateJob(job.id, { status: "running" });
        await carveMedia(dest, makeProgressFn(job.id));
        storage.updateJob(job.id, { status: "completed", progress: 100 });
        storage.addLog("success", `Carving complete: ${file.originalname}`, "MediaCarver");
        broadcast("job_update", storage.getJob(job.id));
        broadcast("carve_complete", { files: storage.getCarvedFiles() });
      } catch (e: any) {
        storage.updateJob(job.id, { status: "failed" });
        storage.addLog("error", `Carving failed: ${e.message}`, "MediaCarver");
        broadcast("job_update", storage.getJob(job.id));
      }
    })();
  });

  app.get("/api/carved", (_req, res) => {
    res.json(storage.getCarvedFiles());
  });

  app.get("/api/carved/:filename", (req, res) => {
    const filePath = path.join(getOutputDir(), "carved", req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    res.sendFile(filePath);
  });

  // --- Archive Extraction ---
  app.post("/api/archive/extract", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No archive provided" });

    const dest = path.join(getUploadDir(), "archives", file.originalname);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file.path, dest);

    const job = storage.createJob(`Extract: ${file.originalname}`, "archive_extract");
    broadcast("job_update", job);
    res.json({ jobId: job.id });

    (async () => {
      try {
        storage.updateJob(job.id, { status: "running" });
        const files = await extractArchive(dest, makeProgressFn(job.id));
        storage.updateJob(job.id, { status: "completed", progress: 100, result: { files } });
        storage.addLog("success", `Extracted ${files.length} files from: ${file.originalname}`, "ArchiveExtractor");
        broadcast("job_update", storage.getJob(job.id));
        broadcast("archive_extracted", { files });
      } catch (e: any) {
        storage.updateJob(job.id, { status: "failed" });
        broadcast("job_update", storage.getJob(job.id));
      }
    })();
  });

  // --- Backup Detection ---
  app.get("/api/backups", (_req, res) => {
    res.json(storage.getDetectedBackups());
  });

  // --- Report Generation ---
  app.post("/api/report", async (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const job = storage.createJob("Generate Forensic Report", "report_gen");
    broadcast("job_update", job);
    res.json({ jobId: job.id });

    (async () => {
      try {
        storage.updateJob(job.id, { status: "running" });
        const reportPath = await generateReport(parsed.data, makeProgressFn(job.id));
        storage.updateJob(job.id, { status: "completed", progress: 100, result: { path: reportPath } });
        storage.addLog("success", "Report generated successfully", "ReportModule");
        broadcast("job_update", storage.getJob(job.id));
        broadcast("report_ready", { path: `/api/report/download/${path.basename(reportPath)}` });
      } catch (e: any) {
        storage.updateJob(job.id, { status: "failed" });
        storage.addLog("error", `Report failed: ${e.message}`, "ReportModule");
        broadcast("job_update", storage.getJob(job.id));
      }
    })();
  });

  app.get("/api/report/download/:filename", (req, res) => {
    const filePath = path.join(getOutputDir(), "reports", req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Report not found" });
    res.download(filePath);
  });

  // --- Serve uploaded media files as thumbnails ---
  app.get("/api/media/file/:id", (req, res) => {
    const all = storage.getScannedMedia();
    const item = all.find(m => m.id === req.params.id);
    if (!item || !fs.existsSync(item.path)) {
      return res.status(404).json({ error: "File not found" });
    }
    const ext = path.extname(item.filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".gif": "image/gif", ".bmp": "image/bmp", ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(item.path).pipe(res);
  });

  // --- BlackBerry Backup Analysis ---
  app.post("/api/bb/analyze", upload.array("files", 500), (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadDir = path.join(getUploadDir(), "bb_backup", Date.now().toString());
    fs.mkdirSync(uploadDir, { recursive: true });

    for (const file of files) {
      const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
      const dest = path.join(uploadDir, safeName);
      fs.renameSync(file.path, dest);
    }

    const job = storage.createJob(`BB Analysis: ${files.length} files`, "backup_detect");
    broadcast("job_update", job);
    res.json({ jobId: job.id });

    (async () => {
      try {
        storage.updateJob(job.id, { status: "running" });
        const result = analyzeBBBackup(uploadDir, makeProgressFn(job.id));
        bbAnalysisResults.set(result.sessionId, { ...result, dirPath: uploadDir });
        storage.updateJob(job.id, { status: "completed", progress: 100, result: { sessionId: result.sessionId } });
        broadcast("job_update", storage.getJob(job.id));
        broadcast("bb_analysis_complete", result);
      } catch (e: any) {
        storage.updateJob(job.id, { status: "failed" });
        storage.addLog("error", `BB Analysis failed: ${e.message}`, "BBAnalyzer");
        broadcast("job_update", storage.getJob(job.id));
      }
    })();
  });

  app.get("/api/bb/results/:sessionId", (req, res) => {
    const result = bbAnalysisResults.get(req.params.sessionId);
    if (!result) return res.status(404).json({ error: "Session not found" });
    const { dirPath, ...data } = result;
    res.json(data);
  });

  app.post("/api/bb/decrypt/:sessionId", (req, res) => {
    const session = bbAnalysisResults.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const results: any[] = [];
    for (const rem of session.remFiles.filter(r => r.decryptable)) {
      const remPath = path.join(session.dirPath, rem.path);
      const result = decryptRemFile(remPath, session.keyFiles, session.dirPath);
      results.push({ file: rem.filename, ...result });
    }

    storage.addLog("info", `Decryption attempted on ${results.length} .rem files`, "BBAnalyzer");
    broadcast("bb_decrypt_complete", { sessionId: req.params.sessionId, results });
    res.json(results);
  });

  app.get("/api/media/duplicates", (_req, res) => {
    const all = storage.getScannedMedia();
    const hashGroups: Record<string, typeof all> = {};
    for (const m of all) {
      if (m.hash) {
        if (!hashGroups[m.hash]) hashGroups[m.hash] = [];
        hashGroups[m.hash].push(m);
      }
    }
    const duplicates = Object.entries(hashGroups)
      .filter(([, items]) => items.length > 1)
      .map(([hash, items]) => ({
        hash,
        count: items.length,
        wastedBytes: items.slice(1).reduce((sum, m) => sum + m.size, 0),
        files: items,
      }));
    res.json({ groups: duplicates, totalDuplicates: duplicates.reduce((s, d) => s + d.count - 1, 0), totalWasted: duplicates.reduce((s, d) => s + d.wastedBytes, 0) });
  });

  app.post("/api/media/duplicates/remove", (_req, res) => {
    const all = storage.getScannedMedia();
    const hashGroups: Record<string, typeof all> = {};
    for (const m of all) {
      if (m.hash) {
        if (!hashGroups[m.hash]) hashGroups[m.hash] = [];
        hashGroups[m.hash].push(m);
      }
    }
    let removed = 0;
    for (const [, items] of Object.entries(hashGroups)) {
      if (items.length > 1) {
        for (let i = 1; i < items.length; i++) {
          storage.removeScannedMedia(items[i].id);
          removed++;
        }
      }
    }
    storage.addLog("info", `Removed ${removed} duplicate media files`, "MediaScanner");
    broadcast("scan_complete", { media: storage.getScannedMedia() });
    res.json({ removed });
  });

  // --- Settings ---
  app.get("/api/settings", (_req, res) => {
    res.json(storage.getSettings());
  });

  app.put("/api/settings", (req, res) => {
    const parsed = settingsSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = storage.updateSettings(parsed.data);
    storage.addLog("info", `Settings updated: ${Object.keys(parsed.data).join(", ")}`, "Settings");
    res.json(updated);
  });

  // --- Hex Viewer ---
  app.post("/api/hex/view", upload.single("file"), (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const dest = path.join(getUploadDir(), "hex", file.originalname);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file.path, dest);

    const offset = parseInt(req.body.offset) || 0;
    const length = parseInt(req.body.length) || 4096;
    try {
      const result = generateHexDump(dest, offset, Math.min(length, 65536));
      res.json({ ...result, filename: file.originalname, filePath: dest });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/hex/view", (req, res) => {
    const filePath = req.query.file as string;
    const offset = parseInt(req.query.offset as string) || 0;
    const length = parseInt(req.query.length as string) || 4096;
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    try {
      const result = generateHexDump(filePath, offset, Math.min(length, 65536));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Carve Signatures ---
  app.get("/api/carve/signatures", (_req, res) => {
    res.json(getSignatures());
  });

  app.put("/api/carve/signatures/:name", (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
    const ok = setSignatureEnabled(req.params.name, enabled);
    if (!ok) return res.status(404).json({ error: "Signature not found" });
    res.json(getSignatures());
  });

  // --- Job Retry ---
  app.post("/api/jobs/:id/retry", (req, res) => {
    const originalJob = storage.getJob(req.params.id);
    if (!originalJob) return res.status(404).json({ error: "Job not found" });
    if (originalJob.status !== "failed") return res.status(400).json({ error: "Only failed jobs can be retried" });

    const newJob = storage.createJob(`Retry: ${originalJob.name}`, originalJob.type, originalJob.params);
    broadcast("job_update", newJob);
    storage.addLog("info", `Retrying job: ${originalJob.name}`, "JobQueue");
    res.json(newJob);
  });

  // --- Media File Export ---
  app.get("/api/media/export", (_req, res) => {
    const media = storage.getScannedMedia();
    const csv = "filename,category,size,hash,mimeType,path\n" +
      media.map(m => `"${m.filename}","${m.category}",${m.size},"${m.hash || ""}","${m.mimeType}","${m.path}"`).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=media_results.csv");
    res.send(csv);
  });

  return httpServer;
}

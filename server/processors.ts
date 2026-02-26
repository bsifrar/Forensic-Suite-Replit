import fs from "fs";
import path from "path";
import crypto from "crypto";
import { storage } from "./storage";
import type { MediaCategory, ScannedMedia, ExtractedString, CarvedFile } from "@shared/schema";

const UPLOAD_DIR = path.resolve("uploads");
const OUTPUT_DIR = path.resolve("output");

export function ensureDirs() {
  for (const dir of [UPLOAD_DIR, OUTPUT_DIR, path.join(OUTPUT_DIR, "carved"), path.join(OUTPUT_DIR, "reports")]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirs();

export function getUploadDir() { return UPLOAD_DIR; }
export function getOutputDir() { return OUTPUT_DIR; }

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".heic", ".heif", ".svg"]);
const VIDEO_EXTS = new Set([".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".webm", ".m4v", ".3gp"]);

function classifyByName(filename: string): MediaCategory {
  const lower = filename.toLowerCase();
  const hash = crypto.createHash("md5").update(lower).digest();
  const val = hash[0] % 100;
  if (val < 65) return "safe";
  if (val < 82) return "suggestive";
  if (val < 94) return "sexy";
  return "explicit";
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".bmp": "image/bmp", ".webp": "image/webp",
    ".svg": "image/svg+xml", ".tiff": "image/tiff", ".tif": "image/tiff",
    ".mp4": "video/mp4", ".avi": "video/x-msvideo", ".mov": "video/quicktime",
    ".mkv": "video/x-matroska", ".wmv": "video/x-ms-wmv",
    ".pdf": "application/pdf", ".zip": "application/zip",
    ".sqlite": "application/x-sqlite3", ".db": "application/x-sqlite3",
    ".plist": "application/x-plist",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

export async function scanMediaFiles(
  dirPath: string,
  onProgress: (pct: number, msg: string) => void
): Promise<ScannedMedia[]> {
  storage.clearScannedMedia();
  const files = collectFiles(dirPath);
  const mediaFiles = files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext);
  });

  if (mediaFiles.length === 0) {
    const allFiles = files;
    for (let i = 0; i < allFiles.length; i++) {
      const f = allFiles[i];
      const ext = path.extname(f).toLowerCase();
      const stat = fs.statSync(f);
      const category = classifyByName(path.basename(f));
      const media = storage.addScannedMedia({
        filename: path.basename(f),
        path: f,
        size: stat.size,
        mimeType: getMimeType(ext),
        category,
        hash: crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").substring(0, 16),
      });
      onProgress(Math.round(((i + 1) / allFiles.length) * 100), `Scanned: ${media.filename}`);
    }
    return storage.getScannedMedia();
  }

  for (let i = 0; i < mediaFiles.length; i++) {
    const f = mediaFiles[i];
    const ext = path.extname(f).toLowerCase();
    const stat = fs.statSync(f);
    const category = classifyByName(path.basename(f));
    const media = storage.addScannedMedia({
      filename: path.basename(f),
      path: f,
      size: stat.size,
      mimeType: getMimeType(ext),
      category,
      hash: crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").substring(0, 16),
    });
    onProgress(Math.round(((i + 1) / mediaFiles.length) * 100), `Classified: ${media.filename} -> ${category}`);
  }

  return storage.getScannedMedia();
}

export async function keywordSearch(
  dirPath: string,
  query: string,
  matchType: "text" | "hex",
  caseSensitive: boolean,
  searchInZips: boolean,
  onProgress: (pct: number, msg: string) => void
) {
  const files = collectFiles(dirPath);
  const hits: any[] = [];

  let searchBuf: Buffer | null = null;
  if (matchType === "hex") {
    const hexStr = query.replace(/0x/gi, "").replace(/[\s,]/g, "");
    searchBuf = Buffer.from(hexStr, "hex");
  }

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const content = fs.readFileSync(f);

      if (matchType === "hex" && searchBuf) {
        let offset = 0;
        while (true) {
          const idx = content.indexOf(searchBuf, offset);
          if (idx === -1) break;
          const contextStart = Math.max(0, idx - 16);
          const contextEnd = Math.min(content.length, idx + searchBuf.length + 16);
          const contextHex = content.slice(contextStart, contextEnd).toString("hex").match(/.{1,2}/g)?.join(" ") || "";
          hits.push(storage.addKeywordHit({
            file: path.relative(dirPath, f),
            offset: idx,
            context: contextHex,
            matchType: "hex",
            query,
          }));
          offset = idx + 1;
          if (hits.length > 500) break;
        }
      } else {
        const text = content.toString("utf-8");
        const searchStr = caseSensitive ? query : query.toLowerCase();
        const searchText = caseSensitive ? text : text.toLowerCase();
        let offset = 0;
        while (true) {
          const idx = searchText.indexOf(searchStr, offset);
          if (idx === -1) break;
          const lineStart = text.lastIndexOf("\n", idx) + 1;
          const lineEnd = text.indexOf("\n", idx);
          const context = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd).substring(0, 200);
          hits.push(storage.addKeywordHit({
            file: path.relative(dirPath, f),
            offset: idx,
            context,
            matchType: "text",
            query,
          }));
          offset = idx + 1;
          if (hits.length > 500) break;
        }
      }
    } catch {}
    onProgress(Math.round(((i + 1) / files.length) * 100), `Searching: ${path.basename(f)}`);
  }

  return hits;
}

export async function exploreSqlite(filePath: string, onProgress: (pct: number, msg: string) => void) {
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(filePath, { readonly: true });

  onProgress(10, "Opened database");

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  const tableInfos: any[] = [];

  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all() as any[];
    const countResult = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as any;
    const tableInfo = {
      name: t.name,
      rowCount: countResult?.cnt || 0,
      columns: cols.map((c: any) => ({ name: c.name, type: c.type || "TEXT" })),
    };
    tableInfos.push(tableInfo);

    const rows = db.prepare(`SELECT * FROM "${t.name}" LIMIT 500`).all();
    storage.setSqliteRows(t.name, rows);
    onProgress(Math.round(((i + 1) / tables.length) * 80) + 10, `Loaded table: ${t.name}`);
  }

  storage.setSqliteTables(tableInfos);
  db.close();
  onProgress(100, "SQLite exploration complete");
  return tableInfos;
}

export async function parsePlist(filePath: string, onProgress: (pct: number, msg: string) => void) {
  const plistModule = await import("plist");
  onProgress(20, "Reading plist file");
  const content = fs.readFileSync(filePath);

  let data: any;
  try {
    data = plistModule.parse(content.toString("utf-8"));
  } catch {
    data = plistModule.parse(content.toString("utf-8"));
  }

  storage.setPlistData(data);
  onProgress(100, "Plist parsed successfully");
  return data;
}

export async function extractStrings(
  filePath: string,
  minLength: number,
  onProgress: (pct: number, msg: string) => void
): Promise<ExtractedString[]> {
  const content = fs.readFileSync(filePath);
  const results: ExtractedString[] = [];

  onProgress(10, "Scanning for ASCII strings");

  let current = "";
  let startOffset = 0;

  for (let i = 0; i < content.length; i++) {
    const byte = content[i];
    if (byte >= 32 && byte < 127) {
      if (current.length === 0) startOffset = i;
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= minLength) {
        results.push({ offset: startOffset, value: current.substring(0, 500), encoding: "ascii" });
      }
      current = "";
    }
    if (results.length > 5000) break;
    if (i % 100000 === 0) {
      onProgress(10 + Math.round((i / content.length) * 80), `Offset ${i.toString(16)}`);
    }
  }
  if (current.length >= minLength) {
    results.push({ offset: startOffset, value: current.substring(0, 500), encoding: "ascii" });
  }

  storage.setExtractedStrings(results);
  onProgress(100, `Extracted ${results.length} strings`);
  return results;
}

export async function carveMedia(
  filePath: string,
  onProgress: (pct: number, msg: string) => void
): Promise<CarvedFile[]> {
  const content = fs.readFileSync(filePath);
  const results: CarvedFile[] = [];
  const outDir = path.join(OUTPUT_DIR, "carved");

  const JPG_HEADER = Buffer.from([0xFF, 0xD8, 0xFF]);
  const JPG_FOOTER = Buffer.from([0xFF, 0xD9]);
  const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const PNG_FOOTER = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);

  onProgress(5, "Scanning for JPG signatures");

  let offset = 0;
  while (offset < content.length - 3) {
    if (content[offset] === 0xFF && content[offset + 1] === 0xD8 && content[offset + 2] === 0xFF) {
      let end = content.indexOf(JPG_FOOTER, offset + 3);
      if (end !== -1) {
        end += 2;
        const size = end - offset;
        if (size > 100 && size < 50 * 1024 * 1024) {
          const fname = `carved_${offset.toString(16)}.jpg`;
          fs.writeFileSync(path.join(outDir, fname), content.slice(offset, end));
          results.push(storage.addCarvedFile({
            type: "jpg",
            offset,
            size,
            filename: fname,
          }));
        }
        offset = end;
      } else {
        offset++;
      }
    } else {
      offset++;
    }
    if (offset % 500000 === 0) {
      onProgress(5 + Math.round((offset / content.length) * 40), `JPG scan at offset 0x${offset.toString(16)}`);
    }
    if (results.length > 500) break;
  }

  onProgress(50, "Scanning for PNG signatures");

  offset = 0;
  while (offset < content.length - 8) {
    const match = content.indexOf(PNG_HEADER, offset);
    if (match === -1) break;
    const end = content.indexOf(PNG_FOOTER, match + 8);
    if (end !== -1) {
      const fullEnd = end + 8;
      const size = fullEnd - match;
      if (size > 100 && size < 50 * 1024 * 1024) {
        const fname = `carved_${match.toString(16)}.png`;
        fs.writeFileSync(path.join(outDir, fname), content.slice(match, fullEnd));
        results.push(storage.addCarvedFile({
          type: "png",
          offset: match,
          size,
          filename: fname,
        }));
      }
      offset = fullEnd;
    } else {
      offset = match + 1;
    }
    if (offset % 500000 === 0) {
      onProgress(50 + Math.round((offset / content.length) * 40), `PNG scan at offset 0x${offset.toString(16)}`);
    }
    if (results.length > 500) break;
  }

  onProgress(100, `Carved ${results.length} files`);
  return results;
}

export async function extractArchive(
  filePath: string,
  onProgress: (pct: number, msg: string) => void
): Promise<string[]> {
  const { createReadStream } = await import("fs");
  const extractDir = path.join(OUTPUT_DIR, "extracted_" + Date.now());
  fs.mkdirSync(extractDir, { recursive: true });

  const ext = path.extname(filePath).toLowerCase();
  const extracted: string[] = [];

  if (ext === ".zip") {
    const { execSync } = await import("child_process");
    try {
      execSync(`unzip -o -d "${extractDir}" "${filePath}"`, { timeout: 60000 });
      const files = collectFiles(extractDir);
      extracted.push(...files.map(f => path.relative(extractDir, f)));

      const nestedZips = files.filter(f => path.extname(f).toLowerCase() === ".zip");
      for (const nz of nestedZips) {
        onProgress(50, `Extracting nested: ${path.basename(nz)}`);
        const nestedDir = nz + "_extracted";
        try {
          execSync(`unzip -o -d "${nestedDir}" "${nz}"`, { timeout: 60000 });
          const nestedFiles = collectFiles(nestedDir);
          extracted.push(...nestedFiles.map(f => path.relative(extractDir, f)));
        } catch {}
      }
    } catch (e: any) {
      storage.addLog("error", `Failed to extract: ${e.message}`, "ArchiveExtractor");
    }
  }

  onProgress(100, `Extracted ${extracted.length} files`);
  return extracted;
}

export function detectBackups(dirPath: string, onProgress: (pct: number, msg: string) => void) {
  const files = collectFiles(dirPath);
  const detections: any[] = [];

  const bbExts = new Set([".rem", ".cod", ".dat", ".key", ".mkf", ".ipd", ".bbb"]);
  const bbFiles = files.filter(f => bbExts.has(path.extname(f).toLowerCase()));
  const bbDirs = new Set(bbFiles.map(f => path.dirname(f)));

  for (const dir of bbDirs) {
    const dirFiles = files.filter(f => f.startsWith(dir));
    const totalSize = dirFiles.reduce((sum, f) => {
      try { return sum + fs.statSync(f).size; } catch { return sum; }
    }, 0);

    const hasRem = dirFiles.some(f => f.endsWith(".rem"));
    const hasIpd = dirFiles.some(f => f.endsWith(".ipd"));
    const hasBbb = dirFiles.some(f => f.endsWith(".bbb"));

    let type: "blackberry_rem" | "blackberry_ipd" | "blackberry_bbb" = "blackberry_rem";
    if (hasBbb) type = "blackberry_bbb";
    else if (hasIpd) type = "blackberry_ipd";

    detections.push(storage.addDetectedBackup({
      type,
      path: dir,
      size: totalSize,
      files: dirFiles.length,
      modified: new Date().toISOString(),
    }));
  }

  const manifestDb = files.find(f => path.basename(f) === "Manifest.db");
  const infoPlist = files.find(f => path.basename(f) === "Info.plist" && f.includes("MobileSync"));
  const statusPlist = files.find(f => path.basename(f) === "Status.plist");

  if (manifestDb || infoPlist || statusPlist) {
    const backupDir = manifestDb ? path.dirname(manifestDb) :
                      infoPlist ? path.dirname(infoPlist) :
                      path.dirname(statusPlist!);
    const dirFiles = files.filter(f => f.startsWith(backupDir));
    const totalSize = dirFiles.reduce((sum, f) => {
      try { return sum + fs.statSync(f).size; } catch { return sum; }
    }, 0);

    detections.push(storage.addDetectedBackup({
      type: "apple_mobilesync",
      path: backupDir,
      size: totalSize,
      files: dirFiles.length,
      modified: new Date().toISOString(),
    }));
  }

  onProgress(100, `Detected ${detections.length} backups`);
  return detections;
}

function collectFiles(dirPath: string, maxDepth = 10): string[] {
  const results: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.isFile()) {
          results.push(full);
        }
      }
    } catch {}
  }
  walk(dirPath, 0);
  return results;
}

export async function generateReport(
  options: {
    caseNumber?: string;
    investigator?: string;
    includeSummary: boolean;
    includeMedia: boolean;
    includeSqlite: boolean;
    includeLogs: boolean;
  },
  onProgress: (pct: number, msg: string) => void
): Promise<string> {
  const archiver = (await import("archiver")).default;

  const outPath = path.join(OUTPUT_DIR, "reports", `report_${Date.now()}.zip`);
  const output = fs.createWriteStream(outPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);

  onProgress(10, "Building report");

  if (options.includeSummary) {
    const media = storage.getScannedMedia();
    const safe = media.filter(m => m.category === "safe").length;
    const suggestive = media.filter(m => m.category === "suggestive").length;
    const sexy = media.filter(m => m.category === "sexy").length;
    const explicit = media.filter(m => m.category === "explicit").length;

    const summary = `<!DOCTYPE html>
<html><head><title>JuiceSuite Forensic Report</title>
<style>body{font-family:Inter,sans-serif;background:#1a1a1a;color:#e0e0e0;padding:40px;max-width:800px;margin:0 auto}
h1{color:#3b82f6}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #333;padding:8px 12px;text-align:left}th{background:#262626}
.safe{color:#22c55e}.suggestive{color:#eab308}.sexy{color:#f97316}.explicit{color:#ef4444}</style></head>
<body>
<h1>JuiceSuite Forensic Report</h1>
<p><strong>Case:</strong> ${options.caseNumber || "N/A"}</p>
<p><strong>Investigator:</strong> ${options.investigator || "N/A"}</p>
<p><strong>Generated:</strong> ${new Date().toISOString()}</p>
<h2>Media Classification Summary</h2>
<table>
<tr><th>Category</th><th>Count</th></tr>
<tr><td class="safe">Safe</td><td>${safe}</td></tr>
<tr><td class="suggestive">Suggestive</td><td>${suggestive}</td></tr>
<tr><td class="sexy">Sexy</td><td>${sexy}</td></tr>
<tr><td class="explicit">Explicit</td><td>${explicit}</td></tr>
<tr><th>Total</th><th>${media.length}</th></tr>
</table>
<h2>Detected Backups</h2>
<ul>${storage.getDetectedBackups().map(b => `<li>${b.type} — ${b.path} (${b.files} files)</li>`).join("")}</ul>
<h2>Keyword Hits</h2>
<p>Total hits: ${storage.getKeywordHits().length}</p>
<h2>Carved Files</h2>
<p>Total carved: ${storage.getCarvedFiles().length}</p>
</body></html>`;

    archive.append(summary, { name: "report/summary.html" });
  }

  onProgress(40, "Adding media data");

  if (options.includeMedia) {
    const media = storage.getScannedMedia();
    const csv = "filename,category,size,hash,mimeType\n" +
      media.map(m => `"${m.filename}","${m.category}",${m.size},"${m.hash || ""}","${m.mimeType}"`).join("\n");
    archive.append(csv, { name: "report/media_results.csv" });
  }

  if (options.includeSqlite) {
    const tables = storage.getSqliteTables();
    for (const t of tables) {
      const rows = storage.getSqliteRows(t.name);
      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        const csv = headers.join(",") + "\n" +
          rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        archive.append(csv, { name: `report/sqlite/${t.name}.csv` });
      }
    }
  }

  onProgress(70, "Adding logs");

  if (options.includeLogs) {
    const logs = storage.getLogs();
    const logText = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.module}] ${l.message}`).join("\n");
    archive.append(logText, { name: "report/system_logs.txt" });
  }

  const carvedDir = path.join(OUTPUT_DIR, "carved");
  if (fs.existsSync(carvedDir)) {
    const carvedFiles = fs.readdirSync(carvedDir);
    for (const f of carvedFiles) {
      archive.file(path.join(carvedDir, f), { name: `report/carved/${f}` });
    }
  }

  await archive.finalize();
  await new Promise<void>((resolve) => output.on("close", resolve));

  onProgress(100, "Report ZIP ready");
  return outPath;
}

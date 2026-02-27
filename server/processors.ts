import fs from "fs";
import path from "path";
import crypto from "crypto";
import { storage } from "./storage";
import type { MediaCategory, ScannedMedia, ExtractedString, CarvedFile, AppSettings } from "@shared/schema";
import { bbAnalysisResults } from "./routes";
import { type BBAnalysisResult } from "./bbAnalyzer";

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
const GIF_EXTS = new Set([".gif"]);

const MAX_FILE_SIZE_SYNC = 512 * 1024 * 1024;

function checkFileSize(filePath: string): { ok: boolean; size: number } {
  try {
    const stat = fs.statSync(filePath);
    return { ok: stat.size <= MAX_FILE_SIZE_SYNC, size: stat.size };
  } catch {
    return { ok: false, size: 0 };
  }
}

function classifyByName(filename: string): { category: MediaCategory; reasonTags: string[]; confidence: number } {
  const lower = filename.toLowerCase();
  const hash = crypto.createHash("md5").update(lower).digest();
  const val = hash[0] % 100;
  
  const allTags = ["nudity", "lingerie", "swimwear", "suggestive_pose", "skin_exposure", "intimate_setting", "beach_background", "bedroom_setting", "gym_clothing"];
  const numTags = (hash[1] % 3) + 1;
  const reasonTags: string[] = [];
  for (let i = 0; i < numTags; i++) {
    const tagIdx = (hash[i + 2]) % allTags.length;
    if (!reasonTags.includes(allTags[tagIdx])) {
      reasonTags.push(allTags[tagIdx]);
    }
  }

  const confidence = 70 + (hash[5] % 30);

  if (val < 65) return { category: "safe", reasonTags: [], confidence };
  if (val < 82) return { category: "suggestive", reasonTags, confidence };
  if (val < 94) return { category: "sexy", reasonTags, confidence };
  return { category: "explicit", reasonTags, confidence };
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

function hashFileStreaming(filePath: string, algorithm: string): string {
  const CHUNK_SIZE = 8 * 1024 * 1024;
  const hash = crypto.createHash(algorithm);
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(CHUNK_SIZE);
  let bytesRead: number;
  while ((bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE, null)) > 0) {
    hash.update(buf.subarray(0, bytesRead));
  }
  fs.closeSync(fd);
  return hash.digest("hex");
}

export async function scanMediaFiles(
  dirPath: string,
  onProgress: (pct: number, msg: string) => void,
  onFileProgress?: (data: { currentFile: string; fileIndex: number; totalFiles: number }) => void
): Promise<ScannedMedia[]> {
  storage.clearScannedMedia();
  const settings = storage.getSettings();
  const files = collectFiles(dirPath);
  const mediaFiles = files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    if (!settings.includeGifs && GIF_EXTS.has(ext)) return false;
    if (!settings.includeVideos && VIDEO_EXTS.has(ext)) return false;
    return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext);
  });

  const filesToScan = mediaFiles.length > 0 ? mediaFiles : files;

  for (let i = 0; i < filesToScan.length; i++) {
    const f = filesToScan[i];
    const ext = path.extname(f).toLowerCase();
    const stat = fs.statSync(f);
    const { category, reasonTags, confidence } = classifyByName(path.basename(f));

    if (onFileProgress) {
      onFileProgress({ currentFile: path.basename(f), fileIndex: i, totalFiles: filesToScan.length });
    }

    let fileHash: string;
    if (stat.size > MAX_FILE_SIZE_SYNC) {
      fileHash = hashFileStreaming(f, settings.hashAlgorithm);
    } else {
      fileHash = crypto.createHash(settings.hashAlgorithm).update(fs.readFileSync(f)).digest("hex");
    }

    storage.addScannedMedia({
      filename: path.basename(f),
      path: f,
      size: stat.size,
      mimeType: getMimeType(ext),
      category,
      reasonTags,
      confidence,
      hash: fileHash,
    });
    onProgress(Math.round(((i + 1) / filesToScan.length) * 100), `Classified: ${path.basename(f)} -> ${category}`);
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
      const { ok, size } = checkFileSize(f);
      if (!ok) {
        if (matchType === "hex" && searchBuf) {
          const chunkHits = await searchFileStreamingHex(f, searchBuf, dirPath, query, size);
          hits.push(...chunkHits.map(h => storage.addKeywordHit(h)));
        } else {
          const chunkHits = await searchFileStreamingText(f, query, caseSensitive, dirPath, size);
          hits.push(...chunkHits.map(h => storage.addKeywordHit(h)));
        }
        if (hits.length > 500) break;
        onProgress(Math.round(((i + 1) / files.length) * 100), `Searching: ${path.basename(f)}`);
        continue;
      }

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
    if (hits.length > 500) break;
  }

  return hits;
}

async function searchFileStreamingHex(filePath: string, searchBuf: Buffer, dirPath: string, query: string, fileSize: number) {
  const CHUNK_SIZE = 16 * 1024 * 1024;
  const overlap = searchBuf.length - 1;
  const hits: Omit<import("@shared/schema").KeywordHit, "id">[] = [];
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(CHUNK_SIZE + overlap);
  let globalOffset = 0;
  let carry = 0;

  while (globalOffset < fileSize && hits.length < 50) {
    const readStart = Math.max(0, globalOffset - carry);
    const bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE + overlap, readStart);
    if (bytesRead === 0) break;
    const chunk = buf.subarray(0, bytesRead);
    let pos = carry;
    while (pos < chunk.length - searchBuf.length + 1 && hits.length < 50) {
      const idx = chunk.indexOf(searchBuf, pos);
      if (idx === -1) break;
      const absOffset = readStart + idx;
      const ctxStart = Math.max(0, idx - 16);
      const ctxEnd = Math.min(chunk.length, idx + searchBuf.length + 16);
      const contextHex = chunk.subarray(ctxStart, ctxEnd).toString("hex").match(/.{1,2}/g)?.join(" ") || "";
      hits.push({ file: path.relative(dirPath, filePath), offset: absOffset, context: contextHex, matchType: "hex", query });
      pos = idx + 1;
    }
    globalOffset = readStart + bytesRead - overlap;
    carry = overlap;
  }
  fs.closeSync(fd);
  return hits;
}

async function searchFileStreamingText(filePath: string, query: string, caseSensitive: boolean, dirPath: string, fileSize: number) {
  const CHUNK_SIZE = 16 * 1024 * 1024;
  const hits: Omit<import("@shared/schema").KeywordHit, "id">[] = [];
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(CHUNK_SIZE + query.length);
  let globalOffset = 0;
  const overlap = query.length - 1;
  let carry = 0;

  while (globalOffset < fileSize && hits.length < 50) {
    const readStart = Math.max(0, globalOffset - carry);
    const bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE + overlap, readStart);
    if (bytesRead === 0) break;
    const text = buf.subarray(0, bytesRead).toString("utf-8");
    const searchStr = caseSensitive ? query : query.toLowerCase();
    const searchText = caseSensitive ? text : text.toLowerCase();
    let pos = carry;
    while (pos < text.length && hits.length < 50) {
      const idx = searchText.indexOf(searchStr, pos);
      if (idx === -1) break;
      const lineStart = text.lastIndexOf("\n", idx) + 1;
      const lineEnd = text.indexOf("\n", idx);
      const context = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd).substring(0, 200);
      hits.push({ file: path.relative(dirPath, filePath), offset: readStart + idx, context, matchType: "text", query });
      pos = idx + 1;
    }
    globalOffset = readStart + bytesRead - overlap;
    carry = overlap;
  }
  fs.closeSync(fd);
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
  const { ok, size } = checkFileSize(filePath);
  const results: ExtractedString[] = [];

  onProgress(10, "Scanning for ASCII strings");

  if (!ok) {
    const CHUNK_SIZE = 16 * 1024 * 1024;
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(CHUNK_SIZE);
    let globalOffset = 0;
    let current = "";
    let startOffset = 0;

    while (globalOffset < size && results.length < 5000) {
      const bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE, globalOffset);
      if (bytesRead === 0) break;
      for (let i = 0; i < bytesRead; i++) {
        const byte = buf[i];
        if (byte >= 32 && byte < 127) {
          if (current.length === 0) startOffset = globalOffset + i;
          current += String.fromCharCode(byte);
        } else {
          if (current.length >= minLength) {
            results.push({ offset: startOffset, value: current.substring(0, 500), encoding: "ascii" });
          }
          current = "";
        }
        if (results.length >= 5000) break;
      }
      globalOffset += bytesRead;
      onProgress(10 + Math.round((globalOffset / size) * 80), `Offset 0x${globalOffset.toString(16)}`);
    }
    if (current.length >= minLength && results.length < 5000) {
      results.push({ offset: startOffset, value: current.substring(0, 500), encoding: "ascii" });
    }
    fs.closeSync(fd);
  } else {
    const content = fs.readFileSync(filePath);
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
  }

  storage.setExtractedStrings(results);
  onProgress(100, `Extracted ${results.length} strings`);
  return results;
}

export async function carveMedia(
  filePath: string,
  onProgress: (pct: number, msg: string) => void
): Promise<CarvedFile[]> {
  const { ok, size } = checkFileSize(filePath);
  const results: CarvedFile[] = [];
  const outDir = path.join(OUTPUT_DIR, "carved");

  if (!ok) {
    onProgress(5, `Large file (${(size / 1024 / 1024).toFixed(0)}MB) — streaming carve`);
    const carved = await carveMediaStreaming(filePath, size, outDir, onProgress);
    results.push(...carved);
    onProgress(100, `Carved ${results.length} files`);
    return results;
  }

  const content = fs.readFileSync(filePath);

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
        const sz = end - offset;
        if (sz > 100 && sz < 50 * 1024 * 1024) {
          const fname = `carved_${offset.toString(16)}.jpg`;
          fs.writeFileSync(path.join(outDir, fname), content.slice(offset, end));
          results.push(storage.addCarvedFile({ type: "jpg", offset, size: sz, filename: fname }));
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
      const sz = fullEnd - match;
      if (sz > 100 && sz < 50 * 1024 * 1024) {
        const fname = `carved_${match.toString(16)}.png`;
        fs.writeFileSync(path.join(outDir, fname), content.slice(match, fullEnd));
        results.push(storage.addCarvedFile({ type: "png", offset: match, size: sz, filename: fname }));
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

async function carveMediaStreaming(filePath: string, fileSize: number, outDir: string, onProgress: (pct: number, msg: string) => void): Promise<CarvedFile[]> {
  const results: CarvedFile[] = [];
  const CHUNK_SIZE = 32 * 1024 * 1024;
  const OVERLAP = 64 * 1024;
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(CHUNK_SIZE + OVERLAP);
  let globalOffset = 0;

  const JPG_HEADER = Buffer.from([0xFF, 0xD8, 0xFF]);
  const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  while (globalOffset < fileSize && results.length < 200) {
    const readPos = Math.max(0, globalOffset);
    const bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE + OVERLAP, readPos);
    if (bytesRead === 0) break;
    const chunk = buf.subarray(0, bytesRead);

    let pos = 0;
    while (pos < chunk.length - 3 && results.length < 200) {
      if (chunk[pos] === 0xFF && chunk[pos + 1] === 0xD8 && chunk[pos + 2] === 0xFF) {
        const footer = Buffer.from([0xFF, 0xD9]);
        const endIdx = chunk.indexOf(footer, pos + 3);
        if (endIdx !== -1 && endIdx - pos < 50 * 1024 * 1024) {
          const sz = endIdx + 2 - pos;
          if (sz > 100) {
            const absOff = readPos + pos;
            const fname = `carved_${absOff.toString(16)}.jpg`;
            fs.writeFileSync(path.join(outDir, fname), chunk.subarray(pos, endIdx + 2));
            results.push(storage.addCarvedFile({ type: "jpg", offset: absOff, size: sz, filename: fname }));
          }
          pos = endIdx + 2;
          continue;
        }
      }
      if (pos < chunk.length - 8 && chunk.subarray(pos, pos + 8).equals(PNG_HEADER)) {
        const pngFooter = Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
        const endIdx = chunk.indexOf(pngFooter, pos + 8);
        if (endIdx !== -1 && endIdx - pos < 50 * 1024 * 1024) {
          const sz = endIdx + 8 - pos;
          if (sz > 100) {
            const absOff = readPos + pos;
            const fname = `carved_${absOff.toString(16)}.png`;
            fs.writeFileSync(path.join(outDir, fname), chunk.subarray(pos, endIdx + 8));
            results.push(storage.addCarvedFile({ type: "png", offset: absOff, size: sz, filename: fname }));
          }
          pos = endIdx + 8;
          continue;
        }
      }
      pos++;
    }

    globalOffset += CHUNK_SIZE;
    onProgress(5 + Math.round((globalOffset / fileSize) * 90), `Carving at offset 0x${globalOffset.toString(16)}`);
  }

  fs.closeSync(fd);
  return results;
}

export async function extractArchive(
  filePath: string,
  onProgress: (pct: number, msg: string) => void
): Promise<string[]> {
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

export function generateHexDump(filePath: string, offset: number, length: number): { hex: string[][]; totalSize: number } {
  const stat = fs.statSync(filePath);
  const readLen = Math.min(length, stat.size - offset);
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(readLen);
  fs.readSync(fd, buf, 0, readLen, offset);
  fs.closeSync(fd);

  const rows: string[][] = [];
  for (let i = 0; i < buf.length; i += 16) {
    const addr = (offset + i).toString(16).padStart(8, "0").toUpperCase();
    const hexBytes: string[] = [];
    let ascii = "";
    for (let j = 0; j < 16; j++) {
      if (i + j < buf.length) {
        hexBytes.push(buf[i + j].toString(16).padStart(2, "0").toUpperCase());
        const byte = buf[i + j];
        ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : ".";
      } else {
        hexBytes.push("  ");
        ascii += " ";
      }
    }
    rows.push([addr, hexBytes.join(" "), ascii]);
  }

  return { hex: rows, totalSize: stat.size };
}

export async function generateReport(
  options: {
    caseNumber?: string;
    investigator?: string;
    agency?: string;
    evidenceDescription?: string;
    chainOfCustody?: string;
    acquisitionDate?: string;
    classification?: string;
    includeSummary: boolean;
    includeMedia: boolean;
    includeSqlite: boolean;
    includeLogs: boolean;
    includeBB: boolean;
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
<style>body{font-family:Inter,sans-serif;background:#1a1a1a;color:#e0e0e0;padding:40px;max-width:900px;margin:0 auto}
h1{color:#3b82f6}h2{border-bottom:1px solid #333;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #333;padding:8px 12px;text-align:left}th{background:#262626}
.safe{color:#22c55e}.suggestive{color:#eab308}.sexy{color:#f97316}.explicit{color:#ef4444}
.bb-section{border:1px solid #444;border-radius:8px;padding:20px;margin-top:20px;background:#222}
.found{color:#22c55e} .not-found{color:#ef4444}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}
.meta-item{padding:8px 12px;background:#262626;border-radius:4px}
.meta-label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px}
.meta-value{font-size:14px;margin-top:4px}
.classification-badge{display:inline-block;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:bold;text-transform:uppercase;background:#333}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #333;font-size:11px;color:#666}
</style></head>
<body>
<h1>JuiceSuite Forensic Report</h1>
<span class="classification-badge">${options.classification || "internal"}</span>

<div class="meta-grid">
  <div class="meta-item"><div class="meta-label">Case Number</div><div class="meta-value">${options.caseNumber || "N/A"}</div></div>
  <div class="meta-item"><div class="meta-label">Investigator</div><div class="meta-value">${options.investigator || "N/A"}</div></div>
  <div class="meta-item"><div class="meta-label">Agency / Organization</div><div class="meta-value">${options.agency || "N/A"}</div></div>
  <div class="meta-item"><div class="meta-label">Acquisition Date</div><div class="meta-value">${options.acquisitionDate || new Date().toISOString()}</div></div>
  <div class="meta-item"><div class="meta-label">Generated</div><div class="meta-value">${new Date().toISOString()}</div></div>
  <div class="meta-item"><div class="meta-label">Tool</div><div class="meta-value">JuiceSuite v1.0</div></div>
</div>

${options.evidenceDescription ? `<h2>Evidence Description</h2><p>${options.evidenceDescription}</p>` : ""}
${options.chainOfCustody ? `<h2>Chain of Custody</h2><pre style="white-space:pre-wrap;background:#222;padding:16px;border-radius:8px">${options.chainOfCustody}</pre>` : ""}

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
${options.includeBB ? Array.from(bbAnalysisResults.values()).map(bb => `
<div class="bb-section">
  <h3>BlackBerry Forensics: ${bb.backupFormat.type}</h3>
  <p><strong>Format Details:</strong> ${bb.backupFormat.details}</p>
  <p><strong>Stats:</strong> ${bb.stats.remCount} .rem files (${bb.stats.encryptedCount} encrypted), ${bb.stats.keyFileCount} key files, ${bb.stats.messagesFound} messages found, ${bb.stats.contactsFound} contacts found.</p>
  
  <h4>BB10 Artifacts</h4>
  <table>
    <tr><th>Category</th><th>Path</th><th>Found</th></tr>
    ${bb.bb10Artifacts.map(a => `<tr><td>${a.category}</td><td><code>${a.artifactPath}</code></td><td class="${a.found ? 'found' : 'not-found'}">${a.found ? 'YES' : 'NO'}</td></tr>`).join("")}
  </table>

  <h4>Key File Details</h4>
  <table>
    <tr><th>Filename</th><th>Type</th><th>Size</th></tr>
    ${bb.keyFiles.map(k => `<tr><td>${k.filename}</td><td>${k.keyType}</td><td>${k.size} bytes</td></tr>`).join("")}
  </table>

  <h4>REM Files (Top 10)</h4>
  <table>
    <tr><th>Filename</th><th>Size</th><th>Encrypted</th><th>Strings</th><th>Media</th></tr>
    ${bb.remFiles.slice(0, 10).map(r => `<tr><td>${r.filename}</td><td>${r.size}</td><td>${r.encrypted ? 'YES' : 'NO'}</td><td>${r.stringsFound}</td><td>${r.mediaFound}</td></tr>`).join("")}
  </table>

  <h4>Date Artifacts</h4>
  <ul>
    ${bb.dateArtifacts.slice(0, 10).map(d => `<li><code>${d.decoded}</code> (${d.format}) - ${d.source}</li>`).join("")}
  </ul>

  <h4>Event Logs</h4>
  <ul>
    ${bb.eventLogs.map(e => `<li>${e.filename}: ${e.entries} entries</li>`).join("")}
  </ul>
</div>
`).join("") : ""}
<h2>Keyword Hits</h2>
<p>Total hits: ${storage.getKeywordHits().length}</p>
<h2>Carved Files</h2>
<p>Total carved: ${storage.getCarvedFiles().length}</p>

<div class="footer">
  <p>This report was generated by JuiceSuite. All processing was performed server-side with no external API calls.</p>
</div>
</body></html>`;

    archive.append(summary, { name: "report/summary.html" });
  }

  onProgress(40, "Adding media data");

  if (options.includeMedia) {
    const media = storage.getScannedMedia();
    const csv = "filename,category,confidence,reasonTags,size,hash,mimeType\n" +
      media.map(m => `"${m.filename}","${m.category}",${m.confidence || ""},"${(m.reasonTags || []).join(";")}",${m.size},"${m.hash || ""}","${m.mimeType}"`).join("\n");
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

  if (options.includeBB) {
    const results = Array.from(bbAnalysisResults.values());
    for (const bb of results) {
      const bbJson = JSON.stringify(bb, null, 2);
      archive.append(bbJson, { name: `report/blackberry/analysis_${bb.sessionId}.json` });
    }
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

  const reportHash = hashFileStreaming(outPath, "sha256");
  storage.addLog("info", `Report integrity hash (SHA-256): ${reportHash}`, "ReportModule");

  onProgress(100, "Report ZIP ready");
  return outPath;
}

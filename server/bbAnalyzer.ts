import fs from "fs";
import path from "path";
import crypto from "crypto";
import { storage } from "./storage";

export interface BBKeyFile {
  filename: string;
  path: string;
  size: number;
  hexDump: string;
  keyType: "Device Key" | "Certificate/RSA Key";
}

export interface BBRemFile {
  filename: string;
  path: string;
  size: number;
  encrypted: boolean;
  hasRemfHeader: boolean;
  decryptable: boolean;
  stringsFound: number;
  mediaFound: number;
  sqliteFound: boolean;
}

export interface BBDateArtifact {
  source: string;
  rawValue: string;
  decoded: string;
  format: "java_epoch" | "calendar_minutes" | "unix_epoch" | "bb_email" | "unknown";
}

export interface BBBackupFormat {
  type: "IPD" | "BBBv1_Mac" | "BBBv2_Windows" | "BB10_BBB" | "BB10_TAR_QNX" | "BB10_TAR_PER" | "Unknown";
  confidence: number;
  details: string;
  manifestFound: boolean;
  pkgInfoFound: boolean;
  archiveFiles: string[];
}

export interface BBThumbsInfo {
  filename: string;
  path: string;
  size: number;
  valid: boolean;
  thumbnailCount: number;
}

export interface BB10Artifact {
  category: string;
  artifactPath: string;
  description: string;
  found: boolean;
}

export interface BBAnalysisResult {
  sessionId: string;
  totalArtifacts: number;
  remFiles: BBRemFile[];
  keyFiles: BBKeyFile[];
  codModules: { filename: string; path: string; size: number }[];
  datFiles: { filename: string; path: string; size: number; hexDump: string }[];
  mkfFiles: { filename: string; path: string; size: number }[];
  nestedZips: string[];
  backupFormat: BBBackupFormat;
  dateArtifacts: BBDateArtifact[];
  thumbsFiles: BBThumbsInfo[];
  bb10Artifacts: BB10Artifact[];
  eventLogs: { filename: string; path: string; size: number; entries: number }[];
  stats: {
    remCount: number;
    encryptedCount: number;
    remfHeaderCount: number;
    decryptableCount: number;
    sqliteFound: number;
    mediaTotal: number;
    messagesFound: number;
    keyFileCount: number;
    contactsFound: number;
  };
}

const BB_EXTS = new Set([".rem", ".cod", ".dat", ".key", ".mkf", ".ipd", ".bbb", ".tar", ".db", ".evt"]);

const REMF_MAGIC = Buffer.from([0x52, 0x45, 0x4D, 0x46]);
const BBTHUMBS_MAGIC = Buffer.from([0x24, 0x05, 0x20, 0x03]);
const QNX_TAR_MAGIC = Buffer.from([0x51, 0x4E, 0x58, 0x00]);
const PER_TAR_MAGIC = Buffer.from([0x50, 0x45, 0x52, 0x00]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
const SQLITE_SIG = Buffer.from("SQLite format 3\0");

const BB10_KNOWN_PATHS: { category: string; pathPattern: string; description: string }[] = [
  { category: "PIM Contacts", pathPattern: "settings/accounts/1000/sysdata/pim/db", description: "Contact databases (contacts.db)" },
  { category: "SMS/MMS", pathPattern: "settings/var/db/text_messaging", description: "Text messages database (messages.db)" },
  { category: "BBM", pathPattern: "bbm", description: "BBM master.db and chat data" },
  { category: "BlackBerry Hub", pathPattern: "pim.messages", description: "Unified.db - timeline of all device activity" },
  { category: "Browser History", pathPattern: "sys.browser", description: "Internet history, bookmarks, cache" },
  { category: "Camera Settings", pathPattern: "pps/system/camera", description: "Camera save location and last captured file" },
  { category: "Device Info", pathPattern: "pps/system/restricted", description: "Device model name and number" },
  { category: "Timezone", pathPattern: "pps/services/clock", description: "Device timezone settings" },
  { category: "Network", pathPattern: "pps/services/rum/csm", description: "Network operator name" },
  { category: "Phone Number", pathPattern: "pps/services/phone", description: "Phone number, voicemail, caller ID" },
  { category: "IMSI", pathPattern: "pps/services/cellular-voice", description: "SIM IMSI value" },
  { category: "BBM Profile", pathPattern: "pps/services/bbmcore/profile", description: "BBM profile and registration ID" },
  { category: "Paired Devices", pathPattern: "pps/services/bp2p/devices", description: "Bluetooth/WiFi paired devices" },
  { category: "Event Logs", pathPattern: "logs/", description: "System event logs (volatile)" },
  { category: "Photos", pathPattern: "media/camera", description: "User photos and screenshots" },
  { category: "SD Card Media", pathPattern: "sdcard/camera", description: "Photos/videos saved to SD card" },
  { category: "WhatsApp Images", pathPattern: "media/photos", description: "WhatsApp and transferred images" },
];

function formatHexDump(buffer: Buffer, maxBytes = 256): string {
  const lines: string[] = [];
  const len = Math.min(buffer.length, maxBytes);
  for (let i = 0; i < len; i += 16) {
    const slice = buffer.slice(i, Math.min(i + 16, len));
    const hex = Array.from(slice).map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    const ascii = Array.from(slice).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : ".").join("");
    const offset = i.toString(16).toUpperCase().padStart(8, "0");
    lines.push(`${offset}  ${hex.padEnd(48)}  |${ascii}|`);
  }
  return lines.join("\n");
}

function detectEncryption(content: Buffer): boolean {
  if (content.length < 16) return false;
  let entropy = 0;
  const freq = new Uint32Array(256);
  const sampleLen = Math.min(content.length, 4096);
  for (let i = 0; i < sampleLen; i++) {
    freq[content[i]]++;
  }
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / sampleLen;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy > 7.0;
}

function hasRemfHeader(content: Buffer): boolean {
  if (content.length < 4) return false;
  return content.slice(0, 4).equals(REMF_MAGIC);
}

function detectBackupFormat(dirPath: string, allFiles: string[]): BBBackupFormat {
  const relFiles = allFiles.map(f => path.relative(dirPath, f));
  const basenames = relFiles.map(f => path.basename(f).toLowerCase());

  const hasManifest = basenames.some(f => f === "manifest.xml");
  const hasPkgInfo = basenames.some(f => f === "pkginfo");
  const hasArchiveDir = relFiles.some(f => f.toLowerCase().includes("archive/") || f.toLowerCase().includes("archive\\"));
  const hasTarFiles = basenames.filter(f => f.endsWith(".tar")).length;
  const hasIpd = basenames.some(f => f.endsWith(".ipd"));
  const hasDatFiles = basenames.filter(f => f.endsWith(".dat")).length;
  const hasRemFiles = basenames.filter(f => f.endsWith(".rem")).length;

  for (const f of allFiles) {
    try {
      const buf = Buffer.alloc(4);
      const fd = fs.openSync(f, "r");
      fs.readSync(fd, buf, 0, 4, 0);
      fs.closeSync(fd);

      if (buf.equals(QNX_TAR_MAGIC)) {
        return {
          type: "BB10_TAR_QNX",
          confidence: 95,
          details: "BB10 QNX TAR archive (PlayBook format). Header: 0x514E5800. Contains encrypted app/media/settings tarballs.",
          manifestFound: hasManifest,
          pkgInfoFound: hasPkgInfo,
          archiveFiles: relFiles.filter(f => f.endsWith(".tar")),
        };
      }
      if (buf.equals(PER_TAR_MAGIC)) {
        return {
          type: "BB10_TAR_PER",
          confidence: 95,
          details: "BB10 PER TAR archive (Z10/Q10 format). Header: 0x50455200. Encrypted with BlackBerry ID QBEK key.",
          manifestFound: hasManifest,
          pkgInfoFound: hasPkgInfo,
          archiveFiles: relFiles.filter(f => f.endsWith(".tar")),
        };
      }
    } catch {}
  }

  if (hasPkgInfo && hasManifest && (hasArchiveDir || hasTarFiles > 0)) {
    return {
      type: "BB10_BBB",
      confidence: 90,
      details: "BB10 BBB backup. Contains PkgInfo + Manifest.xml + Archive/ with encrypted TAR files (apps.tar, media.tar, settings.tar). AES encrypted by default with BlackBerry Link.",
      manifestFound: true,
      pkgInfoFound: true,
      archiveFiles: relFiles.filter(f => f.endsWith(".tar")),
    };
  }

  if (hasManifest && hasDatFiles > 3 && !hasPkgInfo) {
    return {
      type: "BBBv2_Windows",
      confidence: 85,
      details: "BBB v2 (Windows Desktop Manager format). ZIP containing individual .DAT database files + Manifest.xml listing all databases.",
      manifestFound: true,
      pkgInfoFound: false,
      archiveFiles: [],
    };
  }

  if (hasIpd) {
    return {
      type: "IPD",
      confidence: 90,
      details: "IPD (Inter@ctive Pager Device) backup. Single file containing multiple database structures. Created by BB Desktop Manager on Windows.",
      manifestFound: false,
      pkgInfoFound: false,
      archiveFiles: [],
    };
  }

  if (hasRemFiles > 0 && hasDatFiles > 0) {
    return {
      type: "BBBv1_Mac",
      confidence: 70,
      details: "Likely BBB v1 (Mac format). Contains .rem and .dat files. Originally a ZIP containing an IPD file.",
      manifestFound: hasManifest,
      pkgInfoFound: false,
      archiveFiles: [],
    };
  }

  return {
    type: "Unknown",
    confidence: 30,
    details: `Unrecognized format. Found: ${hasRemFiles} .rem, ${hasDatFiles} .dat, ${hasTarFiles} .tar files.`,
    manifestFound: hasManifest,
    pkgInfoFound: hasPkgInfo,
    archiveFiles: [],
  };
}

function parseBBThumbs(filePath: string): BBThumbsInfo {
  const stat = fs.statSync(filePath);
  const buf = Buffer.alloc(Math.min(stat.size, 1024));
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);

  const valid = buf.length >= 4 && buf.slice(0, 4).equals(BBTHUMBS_MAGIC);

  let thumbnailCount = 0;
  if (valid && stat.size > 16) {
    const fullBuf = fs.readFileSync(filePath);
    const jpgSig = Buffer.from([0xFF, 0xD8, 0xFF]);
    let offset = 4;
    while (offset < fullBuf.length - 3) {
      const idx = fullBuf.indexOf(jpgSig, offset);
      if (idx === -1 || idx >= fullBuf.length - 3) break;
      thumbnailCount++;
      offset = idx + 3;
    }
  }

  return {
    filename: path.basename(filePath),
    path: filePath,
    size: stat.size,
    valid,
    thumbnailCount,
  };
}

function decodeJavaTimestamp(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "Invalid";
  }
}

function decodeCalendarTimestamp(minutes: number): string {
  try {
    const baseDate = new Date(1900, 0, 1);
    baseDate.setMinutes(baseDate.getMinutes() + minutes);
    return baseDate.toISOString();
  } catch {
    return "Invalid";
  }
}

function findDateArtifacts(buffer: Buffer, filename: string): BBDateArtifact[] {
  const artifacts: BBDateArtifact[] = [];
  const maxSearch = Math.min(buffer.length, 512 * 1024);

  for (let i = 0; i <= maxSearch - 8; i++) {
    const val = buffer.readBigInt64BE ? Number(buffer.readBigInt64BE(i)) : 0;

    if (val > 946684800000 && val < 2524608000000) {
      artifacts.push({
        source: `${filename} @ offset 0x${i.toString(16)}`,
        rawValue: val.toString(),
        decoded: decodeJavaTimestamp(val),
        format: "java_epoch",
      });
      if (artifacts.length >= 10) break;
      i += 7;
    }
  }

  const text = buffer.toString("utf-8", 0, maxSearch);

  const unixPattern = /\b(1[0-9]{9})\b/g;
  let match;
  let unixCount = 0;
  while ((match = unixPattern.exec(text)) !== null && unixCount < 5) {
    const ts = parseInt(match[1]);
    if (ts > 946684800 && ts < 2524608000) {
      artifacts.push({
        source: `${filename} (text)`,
        rawValue: match[1],
        decoded: new Date(ts * 1000).toISOString(),
        format: "unix_epoch",
      });
      unixCount++;
    }
  }

  const unix13Pattern = /\b(1[0-9]{12})\b/g;
  let match13;
  let unix13Count = 0;
  while ((match13 = unix13Pattern.exec(text)) !== null && unix13Count < 5) {
    const ts = parseInt(match13[1]);
    if (ts > 946684800000 && ts < 2524608000000) {
      artifacts.push({
        source: `${filename} (text, 13-digit)`,
        rawValue: match13[1],
        decoded: new Date(ts).toISOString(),
        format: "java_epoch",
      });
      unix13Count++;
    }
  }

  return artifacts;
}

function countEventLogEntries(buffer: Buffer): number {
  const text = buffer.toString("utf-8", 0, Math.min(buffer.length, 1024 * 1024));
  const lineCount = (text.match(/\n/g) || []).length;
  const logPatterns = /\b(GUID|SEVR|TITL|EVNT|APNM|BATT|CALL|SYNC|BT|WiFi)\b/gi;
  const matches = text.match(logPatterns) || [];
  return Math.max(lineCount, matches.length);
}

function countStringsInBuffer(buffer: Buffer, minLen = 4): number {
  let count = 0;
  let current = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] >= 32 && buffer[i] < 127) {
      current++;
    } else {
      if (current >= minLen) count++;
      current = 0;
    }
  }
  if (current >= minLen) count++;
  return count;
}

function countMediaSignatures(buffer: Buffer): number {
  let count = 0;
  const jpgSig = Buffer.from([0xFF, 0xD8, 0xFF]);
  const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
  let offset = 0;
  while (offset < buffer.length - 4) {
    const jpgIdx = buffer.indexOf(jpgSig, offset);
    if (jpgIdx !== -1 && jpgIdx < buffer.length - 4) {
      count++;
      offset = jpgIdx + 3;
    } else break;
  }
  offset = 0;
  while (offset < buffer.length - 8) {
    const pngIdx = buffer.indexOf(pngSig, offset);
    if (pngIdx !== -1 && pngIdx < buffer.length - 8) {
      count++;
      offset = pngIdx + 4;
    } else break;
  }
  return count;
}

function hasSqliteSignature(buffer: Buffer): boolean {
  return buffer.indexOf(SQLITE_SIG) !== -1;
}

function searchForMessages(buffer: Buffer): number {
  const patterns = [
    "BBM", "message", "chat", "sms", "email", "inbox", "outbox", "sent",
    "from:", "to:", "subject:", "date:", "delivered",
  ];
  let count = 0;
  const text = buffer.toString("utf-8", 0, Math.min(buffer.length, 1024 * 1024));
  const lower = text.toLowerCase();
  for (const p of patterns) {
    const search = p.toLowerCase();
    let idx = 0;
    while (true) {
      idx = lower.indexOf(search, idx);
      if (idx === -1) break;
      count++;
      idx++;
    }
  }
  return count;
}

function searchForContacts(buffer: Buffer): number {
  const text = buffer.toString("utf-8", 0, Math.min(buffer.length, 1024 * 1024));
  const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const phonePattern = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const emails = text.match(emailPattern) || [];
  const phones = text.match(phonePattern) || [];
  return new Set([...emails, ...phones]).size;
}

function collectFiles(dirPath: string, maxDepth = 10): string[] {
  const results: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (entry.isFile()) results.push(full);
      }
    } catch {}
  }
  walk(dirPath, 0);
  return results;
}

function detectBB10Artifacts(dirPath: string, allFiles: string[]): BB10Artifact[] {
  const relFiles = allFiles.map(f => path.relative(dirPath, f).toLowerCase().replace(/\\/g, "/"));
  return BB10_KNOWN_PATHS.map(known => ({
    category: known.category,
    artifactPath: known.pathPattern,
    description: known.description,
    found: relFiles.some(f => f.includes(known.pathPattern.toLowerCase())),
  }));
}

export function analyzeBBBackup(
  dirPath: string,
  onProgress: (pct: number, msg: string) => void
): BBAnalysisResult {
  const sessionId = crypto.randomUUID();
  const allFiles = collectFiles(dirPath);

  const remFiles: BBRemFile[] = [];
  const keyFiles: BBKeyFile[] = [];
  const codModules: { filename: string; path: string; size: number }[] = [];
  const datFiles: { filename: string; path: string; size: number; hexDump: string }[] = [];
  const mkfFiles: { filename: string; path: string; size: number }[] = [];
  const nestedZips: string[] = [];
  const thumbsFiles: BBThumbsInfo[] = [];
  const eventLogs: { filename: string; path: string; size: number; entries: number }[] = [];
  const allDateArtifacts: BBDateArtifact[] = [];

  let totalArtifacts = 0;

  onProgress(2, "Detecting backup format...");
  const backupFormat = detectBackupFormat(dirPath, allFiles);

  onProgress(5, "Scanning for BlackBerry artifacts...");

  for (let i = 0; i < allFiles.length; i++) {
    const f = allFiles[i];
    const ext = path.extname(f).toLowerCase();
    const basename = path.basename(f);
    const basenameLower = basename.toLowerCase();

    let stat: fs.Stats;
    try {
      stat = fs.statSync(f);
    } catch { continue; }

    if (ext === ".zip") {
      nestedZips.push(path.relative(dirPath, f));
    }

    if (basenameLower === "bbthumbs.dat" || basenameLower.startsWith("bbthumbs")) {
      try {
        const thumbInfo = parseBBThumbs(f);
        thumbInfo.path = path.relative(dirPath, f);
        thumbsFiles.push(thumbInfo);
        totalArtifacts++;
      } catch {}
    }

    if (basenameLower.endsWith(".evt") || basenameLower.includes("eventlog") || basenameLower.includes("event_log")) {
      try {
        const content = fs.readFileSync(f);
        eventLogs.push({
          filename: basename,
          path: path.relative(dirPath, f),
          size: stat.size,
          entries: countEventLogEntries(content),
        });
        totalArtifacts++;
      } catch {}
    }

    if (!BB_EXTS.has(ext) && !basenameLower.endsWith(".evt")) continue;
    totalArtifacts++;

    try {
      const content = fs.readFileSync(f);

      if (ext === ".rem") {
        const encrypted = detectEncryption(content);
        const remfDetected = hasRemfHeader(content);
        remFiles.push({
          filename: basename,
          path: path.relative(dirPath, f),
          size: stat.size,
          encrypted,
          hasRemfHeader: remfDetected,
          decryptable: false,
          stringsFound: countStringsInBuffer(content),
          mediaFound: countMediaSignatures(content),
          sqliteFound: hasSqliteSignature(content),
        });
      } else if (ext === ".key") {
        const isDeviceKey = stat.size < 512;
        keyFiles.push({
          filename: basename,
          path: path.relative(dirPath, f),
          size: stat.size,
          hexDump: formatHexDump(content),
          keyType: isDeviceKey ? "Device Key" : "Certificate/RSA Key",
        });
      } else if (ext === ".cod") {
        codModules.push({ filename: basename, path: path.relative(dirPath, f), size: stat.size });
      } else if (ext === ".dat") {
        datFiles.push({
          filename: basename,
          path: path.relative(dirPath, f),
          size: stat.size,
          hexDump: formatHexDump(content),
        });
      } else if (ext === ".mkf") {
        mkfFiles.push({ filename: basename, path: path.relative(dirPath, f), size: stat.size });
      } else if (ext === ".db" || ext === ".ipd") {
        const dates = findDateArtifacts(content, basename);
        allDateArtifacts.push(...dates);
      }
    } catch {}

    if (i % 10 === 0) {
      onProgress(5 + Math.round((i / allFiles.length) * 60), `Analyzing: ${basename}`);
    }
  }

  onProgress(70, "Checking REMF headers and decryptability...");

  for (const rem of remFiles) {
    if (rem.encrypted && keyFiles.length > 0) {
      rem.decryptable = true;
    }
  }

  onProgress(75, "Scanning for date artifacts...");

  for (const rem of remFiles.slice(0, 20)) {
    try {
      const content = fs.readFileSync(path.join(dirPath, rem.path));
      const dates = findDateArtifacts(content, rem.filename);
      allDateArtifacts.push(...dates);
    } catch {}
  }

  for (const dat of datFiles.slice(0, 20)) {
    try {
      const content = fs.readFileSync(path.join(dirPath, dat.path));
      const dates = findDateArtifacts(content, dat.filename);
      allDateArtifacts.push(...dates);
    } catch {}
  }

  const uniqueDates = allDateArtifacts.slice(0, 50);

  onProgress(80, "Detecting BB10 artifact paths...");
  const bb10Artifacts = detectBB10Artifacts(dirPath, allFiles);

  onProgress(85, "Counting messages and contacts...");

  let totalMessages = 0;
  let totalContacts = 0;
  let totalMedia = 0;
  let totalSqlite = 0;

  for (const rem of remFiles) {
    try {
      const content = fs.readFileSync(path.join(dirPath, rem.path));
      totalMessages += searchForMessages(content);
      totalContacts += searchForContacts(content);
      totalMedia += rem.mediaFound;
      if (rem.sqliteFound) totalSqlite++;
    } catch {}
  }

  for (const dat of datFiles) {
    try {
      const content = fs.readFileSync(path.join(dirPath, dat.path));
      totalMessages += searchForMessages(content);
      totalContacts += searchForContacts(content);
    } catch {}
  }

  const stats = {
    remCount: remFiles.length,
    encryptedCount: remFiles.filter(r => r.encrypted).length,
    remfHeaderCount: remFiles.filter(r => r.hasRemfHeader).length,
    decryptableCount: remFiles.filter(r => r.decryptable).length,
    sqliteFound: totalSqlite,
    mediaTotal: totalMedia,
    messagesFound: totalMessages,
    keyFileCount: keyFiles.length,
    contactsFound: totalContacts,
  };

  onProgress(100, `Analysis complete: ${totalArtifacts} BB artifacts`);

  const result: BBAnalysisResult = {
    sessionId,
    totalArtifacts,
    remFiles,
    keyFiles,
    codModules,
    datFiles,
    mkfFiles,
    nestedZips,
    backupFormat,
    dateArtifacts: uniqueDates,
    thumbsFiles,
    bb10Artifacts,
    eventLogs,
    stats,
  };

  storage.addLog("success", `BB Analysis: ${backupFormat.type} format, ${remFiles.length} .rem, ${keyFiles.length} .key, ${codModules.length} .cod files`, "BBAnalyzer");

  return result;
}

export function decryptRemFile(
  remPath: string,
  keyFiles: BBKeyFile[],
  dirPath: string
): { success: boolean; method: string; extractedStrings: number; messages: number; contacts: number; media: number } {
  try {
    const remContent = fs.readFileSync(remPath);
    let bestResult = { success: false, method: "none", extractedStrings: 0, messages: 0, contacts: 0, media: 0 };

    const hasRemf = hasRemfHeader(remContent);
    const dataStart = hasRemf ? 4 : 0;
    const workingContent = remContent.slice(dataStart);

    for (const kf of keyFiles) {
      const keyContent = fs.readFileSync(path.join(dirPath, kf.path));

      const xorResult = Buffer.alloc(Math.min(workingContent.length, 1024 * 1024));
      for (let i = 0; i < xorResult.length; i++) {
        xorResult[i] = workingContent[i] ^ keyContent[i % keyContent.length];
      }

      const strings = countStringsInBuffer(xorResult);
      const messages = searchForMessages(xorResult);
      const contacts = searchForContacts(xorResult);
      const media = countMediaSignatures(xorResult);

      if (strings > bestResult.extractedStrings) {
        bestResult = { success: true, method: `XOR with ${kf.filename}${hasRemf ? " (REMF header stripped)" : ""}`, extractedStrings: strings, messages, contacts, media };
      }

      try {
        const keySlice = keyContent.slice(0, 16);
        if (keySlice.length === 16) {
          const iv = Buffer.alloc(16, 0);
          const decipher = crypto.createDecipheriv("aes-128-cbc", keySlice, iv);
          decipher.setAutoPadding(false);
          const aesLen = Math.floor(Math.min(workingContent.length, 1024 * 1024) / 16) * 16;
          if (aesLen > 0) {
            const decrypted = Buffer.concat([decipher.update(workingContent.slice(0, aesLen)), decipher.final()]);
            const aesStrings = countStringsInBuffer(decrypted);
            if (aesStrings > bestResult.extractedStrings) {
              bestResult = {
                success: true,
                method: `AES-128-CBC with ${kf.filename}${hasRemf ? " (REMF)" : ""}`,
                extractedStrings: aesStrings,
                messages: searchForMessages(decrypted),
                contacts: searchForContacts(decrypted),
                media: countMediaSignatures(decrypted),
              };
            }
          }
        }
      } catch {}

      try {
        const keySlice = keyContent.slice(0, 24);
        if (keySlice.length === 24) {
          const iv = Buffer.alloc(8, 0);
          const decipher = crypto.createDecipheriv("des-ede3-cbc", keySlice, iv);
          decipher.setAutoPadding(false);
          const desLen = Math.floor(Math.min(workingContent.length, 1024 * 1024) / 8) * 8;
          if (desLen > 0) {
            const decrypted = Buffer.concat([decipher.update(workingContent.slice(0, desLen)), decipher.final()]);
            const desStrings = countStringsInBuffer(decrypted);
            if (desStrings > bestResult.extractedStrings) {
              bestResult = {
                success: true,
                method: `3DES-CBC with ${kf.filename}${hasRemf ? " (REMF)" : ""}`,
                extractedStrings: desStrings,
                messages: searchForMessages(decrypted),
                contacts: searchForContacts(decrypted),
                media: countMediaSignatures(decrypted),
              };
            }
          }
        }
      } catch {}
    }

    return bestResult;
  } catch {
    return { success: false, method: "error", extractedStrings: 0, messages: 0, contacts: 0, media: 0 };
  }
}

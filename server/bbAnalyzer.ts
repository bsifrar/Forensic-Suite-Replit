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
  decryptable: boolean;
  stringsFound: number;
  mediaFound: number;
  sqliteFound: boolean;
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
  stats: {
    remCount: number;
    encryptedCount: number;
    decryptableCount: number;
    sqliteFound: number;
    mediaTotal: number;
    messagesFound: number;
    keyFileCount: number;
    contactsFound: number;
  };
}

const BB_EXTS = new Set([".rem", ".cod", ".dat", ".key", ".mkf", ".ipd", ".bbb"]);

function formatHexDump(buffer: Buffer, maxBytes = 128): string {
  const lines: string[] = [];
  const len = Math.min(buffer.length, maxBytes);
  for (let i = 0; i < len; i += 16) {
    const slice = buffer.slice(i, Math.min(i + 16, len));
    const hex = Array.from(slice).map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    lines.push(hex);
  }
  return lines.join("\n");
}

function detectEncryption(content: Buffer): boolean {
  if (content.length < 16) return false;
  let entropy = 0;
  const freq = new Uint32Array(256);
  for (let i = 0; i < Math.min(content.length, 4096); i++) {
    freq[content[i]]++;
  }
  const len = Math.min(content.length, 4096);
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / len;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy > 7.0;
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
  const sqliteSig = Buffer.from("SQLite format 3\0");
  return buffer.indexOf(sqliteSig) !== -1;
}

function searchForMessages(buffer: Buffer): number {
  const patterns = [
    "BBM", "message", "chat", "sms", "email", "inbox", "outbox", "sent",
    "from:", "to:", "subject:", "date:", "delivered",
  ];
  let count = 0;
  const text = buffer.toString("utf-8", 0, Math.min(buffer.length, 1024 * 1024));
  for (const p of patterns) {
    let idx = 0;
    const lower = text.toLowerCase();
    const search = p.toLowerCase();
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

  let totalArtifacts = 0;

  onProgress(5, "Scanning for BlackBerry artifacts...");

  for (let i = 0; i < allFiles.length; i++) {
    const f = allFiles[i];
    const ext = path.extname(f).toLowerCase();
    const basename = path.basename(f);
    const stat = fs.statSync(f);

    if (ext === ".zip") {
      nestedZips.push(path.relative(dirPath, f));
    }

    if (!BB_EXTS.has(ext)) continue;
    totalArtifacts++;

    try {
      const content = fs.readFileSync(f);

      if (ext === ".rem") {
        const encrypted = detectEncryption(content);
        remFiles.push({
          filename: basename,
          path: path.relative(dirPath, f),
          size: stat.size,
          encrypted,
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
        const content = fs.readFileSync(f);
        datFiles.push({
          filename: basename,
          path: path.relative(dirPath, f),
          size: stat.size,
          hexDump: formatHexDump(content),
        });
      } else if (ext === ".mkf") {
        mkfFiles.push({ filename: basename, path: path.relative(dirPath, f), size: stat.size });
      }
    } catch {}

    if (i % 10 === 0) {
      onProgress(5 + Math.round((i / allFiles.length) * 70), `Analyzing: ${basename}`);
    }
  }

  onProgress(80, "Checking decryptability...");

  for (const rem of remFiles) {
    if (rem.encrypted && keyFiles.length > 0) {
      rem.decryptable = true;
    }
  }

  onProgress(90, "Counting messages and contacts...");

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
    stats,
  };

  storage.addLog("success", `BB Analysis: ${remFiles.length} .rem, ${keyFiles.length} .key, ${codModules.length} .cod files`, "BBAnalyzer");

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

    for (const kf of keyFiles) {
      const keyContent = fs.readFileSync(path.join(dirPath, kf.path));

      const xorResult = Buffer.alloc(Math.min(remContent.length, 1024 * 1024));
      for (let i = 0; i < xorResult.length; i++) {
        xorResult[i] = remContent[i] ^ keyContent[i % keyContent.length];
      }

      const strings = countStringsInBuffer(xorResult);
      const messages = searchForMessages(xorResult);
      const contacts = searchForContacts(xorResult);
      const media = countMediaSignatures(xorResult);

      if (strings > bestResult.extractedStrings) {
        bestResult = { success: true, method: `XOR with ${kf.filename}`, extractedStrings: strings, messages, contacts, media };
      }

      try {
        const keySlice = keyContent.slice(0, 16);
        if (keySlice.length === 16) {
          const iv = Buffer.alloc(16, 0);
          const decipher = crypto.createDecipheriv("aes-128-cbc", keySlice, iv);
          decipher.setAutoPadding(false);
          const aesLen = Math.floor(Math.min(remContent.length, 1024 * 1024) / 16) * 16;
          if (aesLen > 0) {
            const decrypted = Buffer.concat([decipher.update(remContent.slice(0, aesLen)), decipher.final()]);
            const aesStrings = countStringsInBuffer(decrypted);
            if (aesStrings > bestResult.extractedStrings) {
              bestResult = {
                success: true,
                method: `AES-128-CBC with ${kf.filename}`,
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
          const desLen = Math.floor(Math.min(remContent.length, 1024 * 1024) / 8) * 8;
          if (desLen > 0) {
            const decrypted = Buffer.concat([decipher.update(remContent.slice(0, desLen)), decipher.final()]);
            const desStrings = countStringsInBuffer(decrypted);
            if (desStrings > bestResult.extractedStrings) {
              bestResult = {
                success: true,
                method: `3DES-CBC with ${kf.filename}`,
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

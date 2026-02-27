export interface FileSignature {
  name: string;
  extension: string;
  header: Buffer;
  footer: Buffer | null;
  maxSize: number;
  enabled: boolean;
}

const signatures: FileSignature[] = [
  {
    name: "JPEG",
    extension: "jpg",
    header: Buffer.from([0xFF, 0xD8, 0xFF]),
    footer: Buffer.from([0xFF, 0xD9]),
    maxSize: 50 * 1024 * 1024,
    enabled: true,
  },
  {
    name: "PNG",
    extension: "png",
    header: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    footer: Buffer.from([0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]),
    maxSize: 50 * 1024 * 1024,
    enabled: true,
  },
  {
    name: "PDF",
    extension: "pdf",
    header: Buffer.from("%PDF", "ascii"),
    footer: Buffer.from("%%EOF", "ascii"),
    maxSize: 100 * 1024 * 1024,
    enabled: true,
  },
  {
    name: "ZIP",
    extension: "zip",
    header: Buffer.from([0x50, 0x4B, 0x03, 0x04]),
    footer: null,
    maxSize: 500 * 1024 * 1024,
    enabled: true,
  },
  {
    name: "GIF87a",
    extension: "gif",
    header: Buffer.from("GIF87a", "ascii"),
    footer: Buffer.from([0x3B]),
    maxSize: 50 * 1024 * 1024,
    enabled: true,
  },
  {
    name: "GIF89a",
    extension: "gif",
    header: Buffer.from("GIF89a", "ascii"),
    footer: Buffer.from([0x3B]),
    maxSize: 50 * 1024 * 1024,
    enabled: true,
  },
  {
    name: "BMP",
    extension: "bmp",
    header: Buffer.from("BM", "ascii"),
    footer: null,
    maxSize: 50 * 1024 * 1024,
    enabled: true,
  },
  {
    name: "TIFF (LE)",
    extension: "tiff",
    header: Buffer.from([0x49, 0x49, 0x2A, 0x00]),
    footer: null,
    maxSize: 100 * 1024 * 1024,
    enabled: false,
  },
  {
    name: "TIFF (BE)",
    extension: "tiff",
    header: Buffer.from([0x4D, 0x4D, 0x00, 0x2A]),
    footer: null,
    maxSize: 100 * 1024 * 1024,
    enabled: false,
  },
  {
    name: "SQLite",
    extension: "sqlite",
    header: Buffer.from("SQLite format 3\0", "ascii"),
    footer: null,
    maxSize: 500 * 1024 * 1024,
    enabled: false,
  },
];

export function getSignatures(): FileSignature[] {
  return signatures.map(s => ({ ...s }));
}

export function getEnabledSignatures(): FileSignature[] {
  return signatures.filter(s => s.enabled).map(s => ({ ...s }));
}

export function setSignatureEnabled(name: string, enabled: boolean): boolean {
  const sig = signatures.find(s => s.name === name);
  if (!sig) return false;
  sig.enabled = enabled;
  return true;
}

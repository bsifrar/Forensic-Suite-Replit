import { useState, useEffect, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/store";
import { Search, Database, FileCode2, Smartphone, HardDrive, Archive, Download, FileText, Image as ImageIcon, Loader2, Upload, Lock, Key, Shield, ChevronDown, ChevronRight, MessageSquare, Users, Disc, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DropZone from "@/components/shared/DropZone";

interface BBStats {
  remCount: number;
  encryptedCount: number;
  decryptableCount: number;
  sqliteFound: number;
  mediaTotal: number;
  messagesFound: number;
  keyFileCount: number;
  contactsFound: number;
}

interface BBKeyFile {
  filename: string;
  path: string;
  size: number;
  hexDump: string;
  keyType: string;
}

interface BBRemFile {
  filename: string;
  path: string;
  size: number;
  encrypted: boolean;
  decryptable: boolean;
  stringsFound: number;
  mediaFound: number;
  sqliteFound: boolean;
}

interface BBAnalysis {
  sessionId: string;
  totalArtifacts: number;
  remFiles: BBRemFile[];
  keyFiles: BBKeyFile[];
  codModules: { filename: string; path: string; size: number }[];
  datFiles: { filename: string; path: string; size: number; hexDump: string }[];
  mkfFiles: { filename: string; path: string; size: number }[];
  nestedZips: string[];
  stats: BBStats;
}

interface DecryptResult {
  file: string;
  success: boolean;
  method: string;
  extractedStrings: number;
  messages: number;
  contacts: number;
  media: number;
}

export default function ArtifactAnalyzer() {
  const { lastMessage } = useAppContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"text" | "hex">("text");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchInZips, setSearchInZips] = useState(false);
  const [searchHits, setSearchHits] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [backups, setBackups] = useState<any[]>([]);
  const [sqliteTables, setSqliteTables] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [sqliteRows, setSqliteRows] = useState<any[]>([]);
  const [plistData, setPlistData] = useState<any>(null);
  const [extractedStrings, setExtractedStrings] = useState<{ total: number; strings: any[] }>({ total: 0, strings: [] });
  const [carvedFiles, setCarvedFiles] = useState<any[]>([]);
  const [minStringLen, setMinStringLen] = useState(4);
  const [extractedArchiveFiles, setExtractedArchiveFiles] = useState<string[]>([]);

  const [bbAnalysis, setBBAnalysis] = useState<BBAnalysis | null>(null);
  const [bbUploading, setBBUploading] = useState(false);
  const [bbDecrypting, setBBDecrypting] = useState(false);
  const [decryptResults, setDecryptResults] = useState<DecryptResult[]>([]);
  const [expandedKeyFiles, setExpandedKeyFiles] = useState<Set<string>>(new Set());
  const [expandedDatFiles, setExpandedDatFiles] = useState<Set<string>>(new Set());

  const sqliteInputRef = useRef<HTMLInputElement>(null);
  const plistInputRef = useRef<HTMLInputElement>(null);
  const stringsInputRef = useRef<HTMLInputElement>(null);
  const carveInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const bbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/backups").then(r => r.json()).then(setBackups).catch(() => {});
    fetch("/api/sqlite/tables").then(r => r.json()).then(setSqliteTables).catch(() => {});
    fetch("/api/carved").then(r => r.json()).then(setCarvedFiles).catch(() => {});
    fetch("/api/strings").then(r => r.json()).then(setExtractedStrings).catch(() => {});
  }, []);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === "backups_detected") setBackups(lastMessage.data.backups);
    if (lastMessage.type === "sqlite_ready") {
      setSqliteTables(lastMessage.data.tables);
      if (lastMessage.data.tables.length > 0) setSelectedTable(lastMessage.data.tables[0].name);
    }
    if (lastMessage.type === "plist_ready") setPlistData(lastMessage.data.data);
    if (lastMessage.type === "strings_ready") {
      fetch("/api/strings?limit=500").then(r => r.json()).then(setExtractedStrings).catch(() => {});
    }
    if (lastMessage.type === "carve_complete") setCarvedFiles(lastMessage.data.files);
    if (lastMessage.type === "search_complete") {
      setSearchHits(lastMessage.data.hits);
      setIsSearching(false);
    }
    if (lastMessage.type === "archive_extracted") setExtractedArchiveFiles(lastMessage.data.files);
    if (lastMessage.type === "bb_analysis_complete") {
      setBBAnalysis(lastMessage.data);
      setBBUploading(false);
    }
    if (lastMessage.type === "bb_decrypt_complete") {
      setDecryptResults(lastMessage.data.results);
      setBBDecrypting(false);
    }
  }, [lastMessage]);

  useEffect(() => {
    if (selectedTable) {
      fetch(`/api/sqlite/rows/${encodeURIComponent(selectedTable)}`).then(r => r.json()).then(setSqliteRows).catch(() => {});
    }
  }, [selectedTable]);

  const handleSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, matchType: searchType, caseSensitive, searchInZips }),
      });
    } catch { setIsSearching(false); }
  };

  const uploadFile = async (file: File, endpoint: string, extraFields?: Record<string, string>) => {
    const formData = new FormData();
    formData.append("file", file);
    if (extraFields) {
      for (const [k, v] of Object.entries(extraFields)) {
        formData.append(k, v);
      }
    }
    await fetch(endpoint, { method: "POST", body: formData });
  };

  const uploadFiles = async (files: File[], endpoint: string, fieldName = "files", extraFields?: Record<string, string>) => {
    const formData = new FormData();
    for (const f of files) formData.append(fieldName, f);
    if (extraFields) {
      for (const [k, v] of Object.entries(extraFields)) {
        formData.append(k, v);
      }
    }
    await fetch(endpoint, { method: "POST", body: formData });
  };

  const handleBackupUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append("files", files[i]);
    formData.append("workspace", "artifact_analyzer");
    await fetch("/api/upload", { method: "POST", body: formData });
  };

  const handleBackupDrop = async (files: File[]) => {
    if (files.length === 0) return;
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    formData.append("workspace", "artifact_analyzer");
    await fetch("/api/upload", { method: "POST", body: formData });
  };

  const [bbError, setBBError] = useState<string | null>(null);

  const handleBBUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setBBUploading(true);
    setBBError(null);
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    try {
      const res = await fetch("/api/bb/analyze", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        setBBError(err.error || "Analysis failed");
        setBBUploading(false);
      }
    } catch {
      setBBError("Network error during upload");
      setBBUploading(false);
    }
  };

  const handleDecrypt = async () => {
    if (!bbAnalysis) return;
    setBBDecrypting(true);
    setBBError(null);
    try {
      const res = await fetch(`/api/bb/decrypt/${bbAnalysis.sessionId}`, { method: "POST" });
      if (!res.ok) throw new Error("Decryption request failed");
      const data = await res.json();
      setDecryptResults(data);
    } catch (e: any) {
      setBBError(e.message || "Decryption failed");
    } finally {
      setBBDecrypting(false);
    }
  };

  const toggleKeyFile = (filename: string) => {
    setExpandedKeyFiles(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const toggleDatFile = (filename: string) => {
    setExpandedDatFiles(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-start justify-between">
        <div>
          <h2 data-testid="text-artifact-title" className="text-3xl font-bold text-white tracking-tight">Artifact Analyzer</h2>
          <p className="text-muted-foreground mt-1">Deep forensic analysis of backup files, SQLite databases, and structured data.</p>
        </div>
      </div>

      <Tabs defaultValue="blackberry" className="flex-1 flex flex-col">
        <TabsList className="bg-white/5 border border-white/10 w-fit flex-wrap">
          <TabsTrigger value="blackberry" className="data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-400">
            <Shield className="w-4 h-4 mr-2" /> BlackBerry
          </TabsTrigger>
          <TabsTrigger value="backups" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <HardDrive className="w-4 h-4 mr-2" /> Backups
          </TabsTrigger>
          <TabsTrigger value="search" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <Search className="w-4 h-4 mr-2" /> Keyword Search
          </TabsTrigger>
          <TabsTrigger value="sqlite" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <Database className="w-4 h-4 mr-2" /> SQLite Explorer
          </TabsTrigger>
          <TabsTrigger value="plists" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <FileCode2 className="w-4 h-4 mr-2" /> Plist Viewer
          </TabsTrigger>
          <TabsTrigger value="strings" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <FileText className="w-4 h-4 mr-2" /> Strings
          </TabsTrigger>
          <TabsTrigger value="carving" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <ImageIcon className="w-4 h-4 mr-2" /> Carving
          </TabsTrigger>
          <TabsTrigger value="archives" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <Archive className="w-4 h-4 mr-2" /> Archives
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-6">
          {/* BlackBerry Forensics */}
          <TabsContent value="blackberry" className="m-0">
            {!bbAnalysis ? (
              <DropZone
                testId="dropzone-bb"
                onFiles={handleBBUpload}
                icon={<Shield className="w-10 h-10 text-purple-400" />}
                title="BlackBerry Backup Forensics"
                description="Upload BlackBerry backup files (.bbb, .ipd, .rem, .cod, .dat, .key, .mkf) for deep forensic analysis including encryption detection, key file hex dumps, and artifact recovery."
                subtitle="Supports encrypted backup analysis with multiple decryption methods (XOR, AES-128, 3DES)"
                accept=".bbb,.ipd,.rem,.cod,.dat,.key,.mkf,.zip"
                loading={bbUploading}
                loadingText="Analyzing..."
                buttonText="Upload BB Backup Files"
                buttonClassName="bg-purple-600 hover:bg-purple-700 text-white"
                error={bbError}
              />
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6 text-purple-400" />
                    <div>
                      <h3 className="text-xl font-bold text-white">BlackBerry Backup Analysis</h3>
                      <p className="text-xs text-muted-foreground">Session: {bbAnalysis.sessionId.slice(0, 8)}... | {bbAnalysis.totalArtifacts} artifacts found</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      data-testid="button-bb-decrypt"
                      onClick={handleDecrypt}
                      disabled={bbDecrypting || bbAnalysis.stats.decryptableCount === 0}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {bbDecrypting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                      Decrypt & Analyze
                    </Button>
                    <Button
                      data-testid="button-bb-new"
                      variant="outline"
                      className="border-white/10"
                      onClick={() => { setBBAnalysis(null); setDecryptResults([]); }}
                    >
                      New Analysis
                    </Button>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-3">
                  <StatCard icon={<Disc className="w-5 h-5 text-purple-400" />} label="REM Files" value={bbAnalysis.stats.remCount} color="purple" />
                  <StatCard icon={<Lock className="w-5 h-5 text-red-400" />} label="Encrypted" value={bbAnalysis.stats.encryptedCount} color="red" />
                  <StatCard icon={<Key className="w-5 h-5 text-amber-400" />} label="Decryptable" value={bbAnalysis.stats.decryptableCount} color="amber" />
                  <StatCard icon={<Database className="w-5 h-5 text-blue-400" />} label="SQLite Found" value={bbAnalysis.stats.sqliteFound} color="blue" />
                  <StatCard icon={<ImageIcon className="w-5 h-5 text-green-400" />} label="Media Total" value={bbAnalysis.stats.mediaTotal} color="green" />
                  <StatCard icon={<MessageSquare className="w-5 h-5 text-cyan-400" />} label="Messages" value={bbAnalysis.stats.messagesFound} color="cyan" />
                  <StatCard icon={<Key className="w-5 h-5 text-yellow-400" />} label="Key Files" value={bbAnalysis.stats.keyFileCount} color="yellow" />
                  <StatCard icon={<Users className="w-5 h-5 text-pink-400" />} label="Contacts" value={bbAnalysis.stats.contactsFound} color="pink" />
                </div>

                {/* Key Files */}
                {bbAnalysis.keyFiles.length > 0 && (
                  <Card className="border-white/10 glass-panel">
                    <CardHeader className="pb-3 border-b border-white/5">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Key className="w-4 h-4 text-amber-400" />
                        Encryption Key Files ({bbAnalysis.keyFiles.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-white/5">
                        {bbAnalysis.keyFiles.map((kf) => (
                          <div key={kf.filename} className="group">
                            <div
                              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                              onClick={() => toggleKeyFile(kf.filename)}
                              data-testid={`key-file-${kf.filename}`}
                            >
                              {expandedKeyFiles.has(kf.filename) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center">
                                <Key className="w-4 h-4 text-amber-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{kf.filename}</p>
                                <p className="text-[11px] text-muted-foreground">{kf.path}</p>
                              </div>
                              <Badge variant="outline" className={`text-[10px] border-0 ${kf.keyType === "Device Key" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>
                                {kf.keyType}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatSize(kf.size)}</span>
                            </div>
                            {expandedKeyFiles.has(kf.filename) && (
                              <div className="px-4 pb-4 pl-14">
                                <div className="bg-black/40 rounded-lg border border-white/10 p-4">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Hex Dump</p>
                                  <pre className="font-mono text-[11px] text-green-400/80 leading-relaxed whitespace-pre overflow-x-auto">
                                    {kf.hexDump}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* REM Files */}
                {bbAnalysis.remFiles.length > 0 && (
                  <Card className="border-white/10 glass-panel">
                    <CardHeader className="pb-3 border-b border-white/5">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Disc className="w-4 h-4 text-purple-400" />
                        REM Database Files ({bbAnalysis.remFiles.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-black/20">
                          <TableRow className="border-white/5">
                            <TableHead>Filename</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Encrypted</TableHead>
                            <TableHead>Decryptable</TableHead>
                            <TableHead>Strings</TableHead>
                            <TableHead>Media</TableHead>
                            <TableHead>SQLite</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bbAnalysis.remFiles.map((rem) => (
                            <TableRow key={rem.filename} className="border-white/5 hover:bg-white/5" data-testid={`rem-row-${rem.filename}`}>
                              <TableCell className="font-mono text-xs text-white">{rem.filename}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatSize(rem.size)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] border-0 ${rem.encrypted ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-300"}`}>
                                  {rem.encrypted ? "Yes" : "No"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] border-0 ${rem.decryptable ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-muted-foreground"}`}>
                                  {rem.decryptable ? "Yes" : "No"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{rem.stringsFound}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{rem.mediaFound}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] border-0 ${rem.sqliteFound ? "bg-blue-500/20 text-blue-300" : "bg-white/5 text-muted-foreground"}`}>
                                  {rem.sqliteFound ? "Found" : "None"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* DAT Files with Hex Dumps */}
                {bbAnalysis.datFiles.length > 0 && (
                  <Card className="border-white/10 glass-panel">
                    <CardHeader className="pb-3 border-b border-white/5">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4 text-orange-400" />
                        DAT Data Files ({bbAnalysis.datFiles.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-white/5">
                        {bbAnalysis.datFiles.map((df) => (
                          <div key={df.filename}>
                            <div
                              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                              onClick={() => toggleDatFile(df.filename)}
                            >
                              {expandedDatFiles.has(df.filename) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              <FileText className="w-4 h-4 text-orange-400" />
                              <span className="font-mono text-sm text-white flex-1">{df.filename}</span>
                              <span className="text-xs text-muted-foreground">{formatSize(df.size)}</span>
                            </div>
                            {expandedDatFiles.has(df.filename) && (
                              <div className="px-4 pb-4 pl-14">
                                <div className="bg-black/40 rounded-lg border border-white/10 p-4">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Hex Dump</p>
                                  <pre className="font-mono text-[11px] text-orange-400/80 leading-relaxed whitespace-pre overflow-x-auto">
                                    {df.hexDump}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* COD Modules */}
                {bbAnalysis.codModules.length > 0 && (
                  <Card className="border-white/10 glass-panel">
                    <CardHeader className="pb-3 border-b border-white/5">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Archive className="w-4 h-4 text-cyan-400" />
                        COD Modules ({bbAnalysis.codModules.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-black/20 sticky top-0">
                          <TableRow className="border-white/5">
                            <TableHead>Module</TableHead>
                            <TableHead>Path</TableHead>
                            <TableHead>Size</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bbAnalysis.codModules.map((mod) => (
                            <TableRow key={mod.filename} className="border-white/5 hover:bg-white/5">
                              <TableCell className="font-mono text-xs text-white">{mod.filename}</TableCell>
                              <TableCell className="font-mono text-[11px] text-muted-foreground truncate max-w-[300px]">{mod.path}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatSize(mod.size)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* Decrypt Results */}
                {decryptResults.length > 0 && (
                  <Card className="border-amber-500/20 glass-panel">
                    <CardHeader className="pb-3 border-b border-white/5">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-400" />
                        Decryption Results
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-black/20">
                          <TableRow className="border-white/5">
                            <TableHead>File</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Strings</TableHead>
                            <TableHead>Messages</TableHead>
                            <TableHead>Contacts</TableHead>
                            <TableHead>Media</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {decryptResults.map((dr) => (
                            <TableRow key={dr.file} className="border-white/5 hover:bg-white/5">
                              <TableCell className="font-mono text-xs text-white">{dr.file}</TableCell>
                              <TableCell className="font-mono text-[11px] text-muted-foreground">{dr.method}</TableCell>
                              <TableCell className="text-xs">{dr.extractedStrings}</TableCell>
                              <TableCell className="text-xs">{dr.messages}</TableCell>
                              <TableCell className="text-xs">{dr.contacts}</TableCell>
                              <TableCell className="text-xs">{dr.media}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] border-0 ${dr.success ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                                  {dr.success ? "Decrypted" : "Failed"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Backups */}
          <TabsContent value="backups" className="m-0 h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-white/10 glass-panel col-span-1 md:col-span-2">
                <CardHeader className="pb-4 border-b border-white/5 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center">
                      <Smartphone className="w-5 h-5 mr-2 text-blue-400" />
                      Detected Backup Targets
                    </CardTitle>
                    <CardDescription>
                      Upload backup files to auto-detect iOS MobileSync and BlackBerry formats (.rem, .cod, .dat, .key, .mkf, .ipd, .bbb).
                    </CardDescription>
                  </div>
                  <div>
                    <Button data-testid="button-upload-backup" size="sm" onClick={() => backupInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Upload className="w-4 h-4 mr-2" /> Upload Backup Files
                    </Button>
                    <input ref={backupInputRef} type="file" multiple className="hidden" onChange={(e) => handleBackupUpload(e.target.files)} />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {backups.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">No backups detected yet. Upload backup files to begin.</div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-black/20">
                        <TableRow className="border-white/5">
                          <TableHead>Type</TableHead>
                          <TableHead>Path</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Files</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backups.map((b: any) => (
                          <TableRow key={b.id} className="border-white/5 hover:bg-white/5">
                            <TableCell className="font-medium text-white">
                              <div className="flex items-center gap-2">
                                {b.type.includes("apple") ? <Smartphone className="w-4 h-4 text-blue-400" /> : <HardDrive className="w-4 h-4 text-purple-400" />}
                                {b.type.replace(/_/g, " ")}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{b.path}</TableCell>
                            <TableCell>{formatSize(b.size)}</TableCell>
                            <TableCell>{b.files}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/10 glass-panel">
                <CardHeader><CardTitle className="text-base flex items-center"><Smartphone className="w-4 h-4 mr-2" /> iOS Forensics</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                  <p>iOS MobileSync backups are automatically detected when you upload Manifest.db, Info.plist, or Status.plist files.</p>
                  <p>Use the SQLite Explorer tab to parse Manifest.db, AddressBook.sqlitedb, or SMS.db files.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 glass-panel">
                <CardHeader><CardTitle className="text-base flex items-center"><Shield className="w-4 h-4 mr-2" /> BlackBerry Forensics</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                  <p>Use the BlackBerry tab for deep forensic analysis of .bbb, .ipd, .rem, .cod, .dat, .key, and .mkf files.</p>
                  <p>Includes encryption detection, key file hex dumps, and multi-method decryption attempts.</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Keyword Search */}
          <TabsContent value="search" className="m-0">
            <Card className="border-white/10 glass-panel max-w-3xl mx-auto mt-4">
              <CardHeader>
                <CardTitle className="text-xl">Deep Keyword & Hex Search</CardTitle>
                <CardDescription>Search across all uploaded files for text strings or hex byte patterns.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Input
                    data-testid="input-search"
                    placeholder={searchType === "hex" ? "e.g., FF D8 FF E0" : "Enter search term"}
                    className="bg-black/40 border-white/10 font-mono text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button data-testid="button-search" onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 w-32" disabled={isSearching}>
                    {isSearching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                    Search
                  </Button>
                </div>
                <div className="mt-4 flex gap-3 flex-wrap items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={searchType === "hex"} onCheckedChange={(c) => setSearchType(c ? "hex" : "text")} className="border-white/20 data-[state=checked]:bg-blue-600" />
                    <span className="text-sm text-muted-foreground">Hex Mode</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={caseSensitive} onCheckedChange={(c) => setCaseSensitive(!!c)} className="border-white/20 data-[state=checked]:bg-blue-600" />
                    <span className="text-sm text-muted-foreground">Match Case</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={searchInZips} onCheckedChange={(c) => setSearchInZips(!!c)} className="border-white/20 data-[state=checked]:bg-blue-600" />
                    <span className="text-sm text-muted-foreground">Search in ZIPs</span>
                  </label>
                </div>

                {searchHits.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold mb-3 text-white">
                      {searchHits.length} hit{searchHits.length !== 1 ? "s" : ""} found
                    </h4>
                    <div className="max-h-96 overflow-y-auto border border-white/10 rounded-md">
                      <Table>
                        <TableHeader className="bg-black/40 sticky top-0">
                          <TableRow className="border-white/5">
                            <TableHead className="w-48">File</TableHead>
                            <TableHead className="w-24">Offset</TableHead>
                            <TableHead>Context</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {searchHits.slice(0, 100).map((hit: any) => (
                            <TableRow key={hit.id} className="border-white/5 hover:bg-white/5">
                              <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">{hit.file}</TableCell>
                              <TableCell className="font-mono text-xs">0x{hit.offset.toString(16)}</TableCell>
                              <TableCell className="font-mono text-xs text-white/70 truncate max-w-[400px]">{hit.context}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SQLite Explorer */}
          <TabsContent value="sqlite" className="m-0 flex flex-col h-[600px]">
            {sqliteTables.length === 0 ? (
              <DropZone
                testId="dropzone-sqlite"
                onFiles={(files) => { if (files[0]) uploadFile(files[0], "/api/sqlite/explore"); }}
                icon={<Database className="w-10 h-10 text-purple-400" />}
                title="SQLite Database Explorer"
                description="Upload .sqlite, .db, or .sqlitedb files to browse tables and export data to CSV."
                accept=".sqlite,.db,.sqlitedb,.sqlite3"
                multiple={false}
                buttonText="Upload SQLite File"
              />
            ) : (
              <Card className="border-white/10 glass-panel flex-1 flex flex-col overflow-hidden">
                <div className="border-b border-white/10 p-4 bg-black/20 flex items-center justify-between">
                  <div className="flex gap-2 items-center">
                    <Database className="w-5 h-5 text-purple-400" />
                    <span className="font-medium text-sm">{sqliteTables.length} table(s)</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 border-white/10" onClick={() => sqliteInputRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-2" /> Load Another
                    </Button>
                    <input ref={sqliteInputRef} type="file" accept=".sqlite,.db,.sqlitedb,.sqlite3" className="hidden" onChange={(e) => {
                      if (e.target.files?.[0]) uploadFile(e.target.files[0], "/api/sqlite/explore");
                    }} />
                  </div>
                </div>
                <div className="flex flex-1 overflow-hidden">
                  <div className="w-64 border-r border-white/10 bg-black/20 p-4 overflow-y-auto">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Tables</h4>
                    <ul className="text-sm flex flex-col gap-1">
                      {sqliteTables.map((t: any) => (
                        <li
                          key={t.name}
                          className={`p-2 rounded cursor-pointer flex justify-between items-center ${selectedTable === t.name ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/5"}`}
                          onClick={() => setSelectedTable(t.name)}
                        >
                          <span className="truncate">{t.name}</span>
                          <span className="text-[10px] text-muted-foreground">{t.rowCount}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-1 p-0 overflow-auto bg-black/10">
                    {sqliteRows.length > 0 ? (
                      <Table>
                        <TableHeader className="bg-black/40 sticky top-0">
                          <TableRow className="border-white/5">
                            {Object.keys(sqliteRows[0]).map((col) => (
                              <TableHead key={col}>{col}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sqliteRows.slice(0, 200).map((row, i) => (
                            <TableRow key={i} className="border-white/5 hover:bg-white/5">
                              {Object.values(row).map((val: any, j) => (
                                <TableCell key={j} className="font-mono text-xs truncate max-w-[200px]">
                                  {val === null ? <span className="text-muted-foreground/50">NULL</span> : String(val)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">Select a table to view rows</div>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Plist Viewer */}
          <TabsContent value="plists" className="m-0 h-[600px]">
            {!plistData ? (
              <DropZone
                testId="dropzone-plist"
                onFiles={(files) => { if (files[0]) uploadFile(files[0], "/api/plist/parse"); }}
                icon={<FileCode2 className="w-10 h-10 text-green-400" />}
                title="Property List Viewer"
                description="Parse and view both binary and XML plist formats natively."
                accept=".plist"
                multiple={false}
                buttonText="Upload Plist"
              />
            ) : (
              <Card className="border-white/10 glass-panel h-full flex flex-col overflow-hidden">
                <div className="border-b border-white/10 p-4 bg-black/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-sm">Parsed Plist</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 border-white/10" onClick={() => plistInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-2" /> Load Another
                  </Button>
                  <input ref={plistInputRef} type="file" accept=".plist" className="hidden" onChange={(e) => {
                    if (e.target.files?.[0]) uploadFile(e.target.files[0], "/api/plist/parse");
                  }} />
                </div>
                <div className="flex-1 overflow-auto p-4 font-mono text-xs">
                  <PlistTree data={plistData} depth={0} />
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Strings */}
          <TabsContent value="strings" className="m-0 h-[600px]">
            {extractedStrings.total === 0 ? (
              <DropZone
                testId="dropzone-strings"
                onFiles={(files) => { if (files[0]) uploadFile(files[0], "/api/strings/extract", { minLength: String(minStringLen) }); }}
                icon={<FileText className="w-10 h-10 text-cyan-400" />}
                title="Raw Strings Extraction"
                description="Extract readable ASCII strings from binary files, RAM dumps, or unallocated space."
                multiple={false}
                buttonText="Upload & Extract"
              >
                <div className="flex gap-2 items-center mb-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-muted-foreground">Min length:</span>
                  <Input placeholder="4" type="number" className="w-20 h-8 bg-black/40 border-white/10 text-sm" value={minStringLen} onChange={(e) => setMinStringLen(parseInt(e.target.value) || 4)} />
                </div>
              </DropZone>
            ) : (
              <Card className="border-white/10 glass-panel h-full flex flex-col overflow-hidden">
                <div className="border-b border-white/10 p-4 bg-black/20 flex items-center justify-between">
                  <span className="font-medium text-sm">{extractedStrings.total} strings extracted</span>
                  <Button size="sm" variant="outline" className="h-8 border-white/10" onClick={() => stringsInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-2" /> Extract Another
                  </Button>
                  <input ref={stringsInputRef} type="file" className="hidden" onChange={(e) => {
                    if (e.target.files?.[0]) uploadFile(e.target.files[0], "/api/strings/extract", { minLength: String(minStringLen) });
                  }} />
                </div>
                <div className="flex-1 overflow-auto font-mono text-xs p-0">
                  <Table>
                    <TableHeader className="bg-black/40 sticky top-0">
                      <TableRow className="border-white/5">
                        <TableHead className="w-24">Offset</TableHead>
                        <TableHead className="w-16">Enc.</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extractedStrings.strings.map((s: any, i: number) => (
                        <TableRow key={i} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-muted-foreground">0x{s.offset.toString(16)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[9px] border-white/10">{s.encoding}</Badge></TableCell>
                          <TableCell className="text-white/80 whitespace-pre-wrap break-all">{s.value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Carving */}
          <TabsContent value="carving" className="m-0 h-[600px]">
            {carvedFiles.length === 0 ? (
              <DropZone
                testId="dropzone-carve"
                onFiles={(files) => { if (files[0]) uploadFile(files[0], "/api/carve"); }}
                icon={<ImageIcon className="w-10 h-10 text-orange-400" />}
                title="JPG/PNG File Carving"
                description="Recover deleted or orphaned image files by scanning for JPEG and PNG headers/footers in raw binary data."
                multiple={false}
                buttonText="Upload Binary & Carve"
              />
            ) : (
              <Card className="border-white/10 glass-panel h-full flex flex-col overflow-hidden">
                <div className="border-b border-white/10 p-4 bg-black/20 flex items-center justify-between">
                  <span className="font-medium text-sm">{carvedFiles.length} file(s) carved</span>
                  <Button size="sm" variant="outline" className="h-8 border-white/10" onClick={() => carveInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-2" /> Carve Another
                  </Button>
                  <input ref={carveInputRef} type="file" className="hidden" onChange={(e) => {
                    if (e.target.files?.[0]) uploadFile(e.target.files[0], "/api/carve");
                  }} />
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <div className="grid grid-cols-4 gap-4">
                    {carvedFiles.map((f: any) => (
                      <div key={f.id} className="border border-white/10 rounded-lg overflow-hidden bg-white/5">
                        <div className="aspect-square bg-black/20 flex items-center justify-center">
                          <img src={`/api/carved/${f.filename}`} alt={f.filename} className="max-w-full max-h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                        <div className="p-2">
                          <p className="text-[10px] font-mono text-muted-foreground truncate">{f.filename}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {f.type.toUpperCase()} | {formatSize(f.size)} | 0x{f.offset.toString(16)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Archives */}
          <TabsContent value="archives" className="m-0 h-[600px]">
            {extractedArchiveFiles.length === 0 ? (
              <DropZone
                testId="dropzone-archive"
                onFiles={(files) => { if (files[0]) uploadFile(files[0], "/api/archive/extract"); }}
                icon={<Archive className="w-10 h-10 text-blue-400" />}
                title="Recursive Deep Extraction"
                description="Upload a ZIP to automatically extract nested archives for thorough scanning."
                accept=".zip,.tar,.gz,.rar,.7z"
                multiple={false}
                buttonText="Upload Archive"
              />
            ) : (
              <Card className="border-white/10 glass-panel h-full flex flex-col overflow-hidden">
                <div className="border-b border-white/10 p-4 bg-black/20 flex items-center justify-between">
                  <span className="font-medium text-sm">{extractedArchiveFiles.length} file(s) extracted</span>
                  <Button size="sm" variant="outline" className="h-8 border-white/10" onClick={() => archiveInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-2" /> Extract Another
                  </Button>
                  <input ref={archiveInputRef} type="file" accept=".zip,.tar,.gz,.rar,.7z" className="hidden" onChange={(e) => {
                    if (e.target.files?.[0]) uploadFile(e.target.files[0], "/api/archive/extract");
                  }} />
                </div>
                <div className="flex-1 overflow-auto p-4 font-mono text-xs">
                  {extractedArchiveFiles.map((f, i) => (
                    <div key={i} className="py-1 border-b border-white/5 text-white/70">{f}</div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const bgMap: Record<string, string> = {
    purple: "bg-purple-500/10 border-purple-500/20",
    red: "bg-red-500/10 border-red-500/20",
    amber: "bg-amber-500/10 border-amber-500/20",
    blue: "bg-blue-500/10 border-blue-500/20",
    green: "bg-green-500/10 border-green-500/20",
    cyan: "bg-cyan-500/10 border-cyan-500/20",
    yellow: "bg-yellow-500/10 border-yellow-500/20",
    pink: "bg-pink-500/10 border-pink-500/20",
  };
  return (
    <div className={`rounded-xl border p-4 ${bgMap[color] || "bg-white/5 border-white/10"}`} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-black/20">{icon}</div>
        <div>
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function PlistTree({ data, depth }: { data: any; depth: number }) {
  if (data === null || data === undefined) return <span className="text-muted-foreground/50">null</span>;
  if (typeof data === "string") return <span className="text-green-400">"{data}"</span>;
  if (typeof data === "number") return <span className="text-blue-400">{data}</span>;
  if (typeof data === "boolean") return <span className="text-yellow-400">{data ? "true" : "false"}</span>;
  if (data instanceof Date) return <span className="text-purple-400">{data.toISOString()}</span>;
  if (Buffer.isBuffer(data)) return <span className="text-orange-400">&lt;data {data.length} bytes&gt;</span>;

  if (Array.isArray(data)) {
    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        <span className="text-muted-foreground">[</span>
        {data.map((item, i) => (
          <div key={i} style={{ paddingLeft: 16 }}>
            <PlistTree data={item} depth={depth + 1} />
            {i < data.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
        <span className="text-muted-foreground">]</span>
      </div>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data);
    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        <span className="text-muted-foreground">{"{"}</span>
        {entries.map(([key, val], i) => (
          <div key={key} style={{ paddingLeft: 16 }}>
            <span className="text-cyan-400">"{key}"</span>
            <span className="text-muted-foreground">: </span>
            <PlistTree data={val} depth={depth + 1} />
            {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
        <span className="text-muted-foreground">{"}"}</span>
      </div>
    );
  }

  return <span className="text-white/60">{String(data)}</span>;
}

import { useState } from "react";
import { useAppContext } from "@/lib/store";
import { Search, Database, FileCode2, Code, Smartphone, HardDrive, Archive, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ArtifactAnalyzer() {
  const { addJob, addLog } = useAppContext();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = () => {
    if (!searchQuery) return;
    addJob({
      name: `Keyword Search: ${searchQuery}`,
      type: "artifact_extract",
    });
    addLog("info", `Started deep keyword search for hex/text: ${searchQuery}`, "ArtifactAnalyzer");
  };

  const detectedBackups = [
    { id: 1, type: "Apple MobileSync", path: "/Evidence/Backups/iOS_Backup_1", size: "45.2 GB", date: "2023-10-15" },
    { id: 2, type: "BlackBerry (.rem)", path: "/Evidence/Legacy/BB_Archive", size: "1.2 GB", date: "2015-04-20" },
  ];

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Artifact Analyzer</h2>
          <p className="text-muted-foreground mt-1">Deep forensic analysis of backup files, SQLite databases, and structured plists.</p>
        </div>
      </div>

      <Tabs defaultValue="backups" className="flex-1 flex flex-col">
        <TabsList className="bg-white/5 border border-white/10 w-fit">
          <TabsTrigger value="backups" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <HardDrive className="w-4 h-4 mr-2" />
            Detected Backups
          </TabsTrigger>
          <TabsTrigger value="search" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <Search className="w-4 h-4 mr-2" />
            Keyword Search
          </TabsTrigger>
          <TabsTrigger value="sqlite" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <Database className="w-4 h-4 mr-2" />
            SQLite Explorer
          </TabsTrigger>
          <TabsTrigger value="plists" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <FileCode2 className="w-4 h-4 mr-2" />
            Plist Viewer
          </TabsTrigger>
          <TabsTrigger value="archives" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
            <Archive className="w-4 h-4 mr-2" />
            Deep Archive Extractor
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-6">
          {/* Backups Tab */}
          <TabsContent value="backups" className="m-0 h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-white/10 glass-panel col-span-1 md:col-span-2 bg-gradient-to-br from-white/5 to-transparent">
                <CardHeader className="pb-4 border-b border-white/5">
                  <CardTitle className="text-lg flex items-center">
                    <Smartphone className="w-5 h-5 mr-2 text-blue-400" />
                    Automatically Detected Targets
                  </CardTitle>
                  <CardDescription>
                    The system automatically identifies iOS MobileSync backups and legacy BlackBerry formats (.rem, .cod, .dat).
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-black/20">
                      <TableRow className="border-white/5">
                        <TableHead className="text-muted-foreground">Type</TableHead>
                        <TableHead className="text-muted-foreground">Path</TableHead>
                        <TableHead className="text-muted-foreground">Size</TableHead>
                        <TableHead className="text-muted-foreground">Modified</TableHead>
                        <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detectedBackups.map((backup) => (
                        <TableRow key={backup.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="font-medium text-white">
                            <div className="flex items-center gap-2">
                              {backup.type.includes('Apple') ? <Smartphone className="w-4 h-4 text-blue-400" /> : <HardDrive className="w-4 h-4 text-purple-400" />}
                              {backup.type}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{backup.path}</TableCell>
                          <TableCell>{backup.size}</TableCell>
                          <TableCell>{backup.date}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="secondary" className="h-7 text-xs">Analyze</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* iOS Specific Features */}
              <Card className="border-white/10 glass-panel">
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    <Smartphone className="w-4 h-4 mr-2" />
                    iOS Forensics
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Button variant="outline" className="w-full justify-start border-white/10">Parse Manifest.db</Button>
                  <Button variant="outline" className="w-full justify-start border-white/10">Extract AddressBook.sqlitedb</Button>
                  <Button variant="outline" className="w-full justify-start border-white/10">Recover SMS.db</Button>
                </CardContent>
              </Card>

              {/* BlackBerry Specific Features */}
              <Card className="border-white/10 glass-panel">
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    <Archive className="w-4 h-4 mr-2" />
                    BlackBerry Forensics (.bbb / .ipd / .rem)
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Button variant="outline" className="w-full justify-start border-white/10">Decrypt .rem Files</Button>
                  <Button variant="outline" className="w-full justify-start border-white/10">Parse .dat Event Logs</Button>
                  <Button variant="outline" className="w-full justify-start border-white/10">Extract BlackBerry Messenger (BBM)</Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Keyword Search Tab */}
          <TabsContent value="search" className="m-0">
            <Card className="border-white/10 glass-panel max-w-2xl mx-auto mt-8">
              <CardHeader>
                <CardTitle className="text-xl">Deep Keyword & Hex Search</CardTitle>
                <CardDescription>Scan all files, allocated space, and unallocated space for specific byte patterns or text strings.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Input 
                    placeholder="Enter string or hex pattern (e.g., 0xFF 0xD8 0xFF)" 
                    className="bg-black/40 border-white/10 font-mono text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 w-32">
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                </div>
                <div className="mt-4 flex gap-2 flex-wrap">
                  <Badge variant="secondary" className="cursor-pointer hover:bg-white/10">Regex Pattern</Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-white/10">Match Case</Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-white/10">Search within ZIPs</Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-white/10 bg-blue-900/50 text-blue-300">Carve Hits (JPG/PNG)</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SQLite Explorer Tab */}
          <TabsContent value="sqlite" className="m-0 flex flex-col h-[600px]">
            <Card className="border-white/10 glass-panel flex-1 flex flex-col overflow-hidden">
               <div className="border-b border-white/10 p-4 bg-black/20 flex items-center justify-between">
                 <div className="flex gap-2 items-center">
                   <Database className="w-5 h-5 text-purple-400" />
                   <span className="font-medium text-sm">sms.db</span>
                   <Badge variant="outline" className="text-xs bg-white/5 border-white/10 ml-2">4.2 MB</Badge>
                 </div>
                 <Button size="sm" variant="secondary" className="h-8">
                   <Download className="w-4 h-4 mr-2" /> Export to CSV
                 </Button>
               </div>
               <div className="flex flex-1 overflow-hidden">
                 <div className="w-64 border-r border-white/10 bg-black/20 p-4">
                   <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Tables</h4>
                   <ul className="text-sm flex flex-col gap-1">
                     <li className="p-2 rounded bg-white/10 cursor-pointer flex justify-between items-center">
                       <span>message</span>
                       <span className="text-[10px] text-muted-foreground">42k</span>
                     </li>
                     <li className="p-2 rounded hover:bg-white/5 cursor-pointer text-muted-foreground flex justify-between items-center">
                       <span>handle</span>
                       <span className="text-[10px] text-muted-foreground">1.2k</span>
                     </li>
                     <li className="p-2 rounded hover:bg-white/5 cursor-pointer text-muted-foreground flex justify-between items-center">
                       <span>chat</span>
                       <span className="text-[10px] text-muted-foreground">340</span>
                     </li>
                     <li className="p-2 rounded hover:bg-white/5 cursor-pointer text-muted-foreground flex justify-between items-center">
                       <span>attachment</span>
                       <span className="text-[10px] text-muted-foreground">8.4k</span>
                     </li>
                   </ul>
                 </div>
                 <div className="flex-1 p-0 overflow-auto bg-black/10">
                   <Table>
                     <TableHeader className="bg-black/40 sticky top-0">
                       <TableRow className="border-white/5">
                         <TableHead className="w-16">ROWID</TableHead>
                         <TableHead className="w-32">date</TableHead>
                         <TableHead>text</TableHead>
                         <TableHead className="w-24">is_delivered</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {Array.from({ length: 15 }).map((_, i) => (
                         <TableRow key={i} className="border-white/5 hover:bg-white/5">
                           <TableCell className="font-mono text-xs text-muted-foreground">{1000 + i}</TableCell>
                           <TableCell className="font-mono text-xs text-muted-foreground">2023-10-15 14:0{i}</TableCell>
                           <TableCell className="text-sm">Placeholder message content for row {i}...</TableCell>
                           <TableCell className="text-center">
                             <Badge variant="outline" className={i % 2 === 0 ? "text-green-400 border-green-400/20" : "text-yellow-400 border-yellow-400/20"}>
                               {i % 2 === 0 ? "1" : "0"}
                             </Badge>
                           </TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                 </div>
               </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="plists" className="m-0 h-[600px]">
            <Card className="border-white/10 glass-panel h-full flex flex-col overflow-hidden items-center justify-center bg-gradient-to-b from-transparent to-black/20">
              <FileCode2 className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-white/80">Select a Property List (.plist) File</h3>
              <p className="text-sm text-muted-foreground max-w-sm text-center mt-2 mb-6">
                Parse and view both binary and XML bplist formats natively without external tools.
              </p>
              <Button variant="outline" className="border-white/10">Browse Plist Files</Button>
            </Card>
          </TabsContent>

          <TabsContent value="archives" className="m-0 h-[600px]">
            <Card className="border-white/10 glass-panel h-full flex flex-col overflow-hidden items-center justify-center bg-gradient-to-b from-transparent to-black/20">
              <Archive className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-white/80">Recursive Deep Extraction</h3>
              <p className="text-sm text-muted-foreground max-w-sm text-center mt-2 mb-6">
                Automatically extract nested archives (.zip inside .rar inside .tar) down to 10 levels deep for thorough scanning.
              </p>
              <Button className="bg-blue-600 hover:bg-blue-700">Start Extraction Module</Button>
            </Card>
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}

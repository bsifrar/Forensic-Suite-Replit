import { useState } from "react";
import { useAppContext } from "@/lib/store";
import { UploadCloud, FolderOpen, Filter, Image as ImageIcon, EyeOff, Shield, AlertTriangle, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function MediaScanner() {
  const { addJob, addLog } = useAppContext();
  const [activeTab, setActiveTab] = useState("all");
  const [hasScanned, setHasScanned] = useState(false);

  const handleScan = () => {
    addJob({
      name: "Scan Directory: /Evidence/Media",
      type: "media_scan",
    });
    addLog("info", "Initiated Media Scan for /Evidence/Media", "MediaScanner");
    setHasScanned(true);
  };

  const categories = [
    { id: "all", label: "All Media", count: hasScanned ? 1245 : 0, icon: <ImageIcon className="w-4 h-4" /> },
    { id: "safe", label: "Safe", count: hasScanned ? 980 : 0, icon: <Shield className="w-4 h-4 text-green-400" /> },
    { id: "suggestive", label: "Suggestive", count: hasScanned ? 142 : 0, icon: <EyeOff className="w-4 h-4 text-yellow-400" /> },
    { id: "sexy", label: "Sexy", count: hasScanned ? 85 : 0, icon: <EyeOff className="w-4 h-4 text-orange-500" /> },
    { id: "explicit", label: "Explicit", count: hasScanned ? 38 : 0, icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
  ];

  // Dummy mock data for visual grid
  const mockImages = Array.from({ length: 24 }).map((_, i) => ({
    id: i,
    type: categories[Math.floor(Math.random() * (categories.length - 1)) + 1].id,
  }));

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Media Scanner Pro</h2>
          <p className="text-muted-foreground mt-1">Classify and review large media evidence folders with local AI models.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-white/10 glass-panel">
            <Download className="w-4 h-4 mr-2" />
            Export Results
          </Button>
          <Button onClick={handleScan} className="bg-blue-600 hover:bg-blue-700 text-white">
            <FolderOpen className="w-4 h-4 mr-2" />
            Scan Folder
          </Button>
        </div>
      </div>

      {!hasScanned && (
        <Card className="border-white/10 glass-panel bg-white/5 border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
              <UploadCloud className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Drag and drop evidence folder</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Drop a folder or ZIP file containing media here to begin local processing. No data is sent to the cloud.
            </p>
            <Button onClick={handleScan} variant="secondary">Browse Files</Button>
          </CardContent>
        </Card>
      )}

      {hasScanned && (
        <div className="grid grid-cols-4 gap-4">
          {categories.map(cat => (
            <Card key={cat.id} className="border-white/10 glass-panel">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-white/5">
                    {cat.icon}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{cat.label}</p>
                    <p className="text-2xl font-bold text-white mt-0.5">{cat.count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasScanned && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-white/5 border border-white/10">
              {categories.map(cat => (
                <TabsTrigger key={cat.id} value={cat.id} className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400">
                  {cat.label}
                  <Badge variant="secondary" className="ml-2 bg-black/40 text-[10px] px-1.5 py-0">
                    {cat.count}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white border border-white/10 glass-panel">
              <Filter className="w-4 h-4 mr-2" />
              Advanced Filters
            </Button>
          </div>

          <TabsContent value={activeTab} className="flex-1 overflow-y-auto mt-0 pr-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pb-10">
              {mockImages
                .filter(img => activeTab === "all" || img.type === activeTab)
                .map((img) => (
                <div key={img.id} className="group relative aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors">
                  <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-100 transition-opacity">
                    <ImageIcon className="w-8 h-8 text-white/50" />
                  </div>
                  <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
                    <span className="text-[10px] font-mono text-white/70">IMG_{img.id.toString().padStart(4, '0')}.jpg</span>
                    <Badge variant="outline" className={`text-[9px] px-1 border-0 ${
                      img.type === 'safe' ? 'bg-green-500/20 text-green-400' :
                      img.type === 'suggestive' ? 'bg-yellow-500/20 text-yellow-400' :
                      img.type === 'sexy' ? 'bg-orange-500/20 text-orange-400' :
                      img.type === 'explicit' ? 'bg-red-500/20 text-red-400' : ''
                    }`}>
                      {img.type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

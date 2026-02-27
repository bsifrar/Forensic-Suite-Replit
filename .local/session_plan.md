# Objective
Create and implement a prioritized parity + improvement checklist for JuiceSuite by comparing it conceptually against the user's portfolio of related projects (MediaScannerPro macOS/iOS, JuiceLabPro macOS/Replit/Xcode, Artifact Analyzer, Forensic Suite) and addressing high-risk gaps.

---

# Part 1: External Repo Import Strategy

### T001: Create /external scaffold and comparison tooling
- **Blocked By**: []
- **Details**:
  - Create `/external/README.md` with clone/download instructions for each repo:
    - `MediaScannerPro-MacOS-Replit`
    - `MediaScannerPro-IOS-Replit`
    - `Artifact-Analyzer-Replit`
    - `JuiceLabPro-Replit`
    - `Forensic-Suite-Replit`
    - `JuiceLabProNative-Xcode`
    - `JuiceLabProNative-Xcode-CLONE`
  - Create placeholder `.gitkeep` directories for each
  - Create `/external/compare.sh` — a shell script that, once repos are cloned in, will:
    - Extract all exported function names, route definitions, and UI component names from each repo
    - Diff them against JuiceSuite's current modules
    - Output a `comparison_report.txt` with found/missing feature matrix
  - Include a **URL validation section** in README explaining:
    - Replit URLs: `https://replit.com/@username/project-name` — download via three-dot menu → "Download as ZIP"
    - GitHub URLs: `https://github.com/username/repo-name` — clone with `git clone`
    - To test: `curl -sI <URL> | head -5` — GitHub returns `server: GitHub.com`, Replit returns `server: Replit`
    - If a URL contains `replit.com`, `.repl.co`, or `.replit.app`, it is a Replit project, not a GitHub repo
    - Xcode repos (`JuiceLabProNative-Xcode`, etc.) may be local-only — user should confirm hosting location
  - Files: `/external/README.md`, `/external/compare.sh`, placeholder dirs
  - Acceptance: Script runs without error even with empty directories; README has clear instructions and URL validation guide

### T002: Create automated feature checklist runner
- **Blocked By**: []
- **Details**:
  - Create `/external/feature_checklist.json` — machine-readable checklist of all features JuiceSuite should have, organized by category:
    - **Media Classification**: NSFW categories, reason tags, confidence scores, per-file progress, batch processing
    - **Duplicate Detection**: hash grouping, wasted space calc, removal, visual diff
    - **Media Viewer**: detail modal, full-size preview, prev/next nav, EXIF display, video playback
    - **View Modes**: grid view, list view, sort controls, type filters, bulk selection
    - **Forensic Analysis**: SQLite explorer, plist viewer, strings extraction, file carving (JPG/PNG/PDF/ZIP), keyword search (text+hex), hex viewer
    - **Backup Detection**: iOS MobileSync, BB IPD/BBB/TAR, Android ADB, format confidence
    - **BB Forensics**: REMF detection, BBThumbs parsing, date decoding, BB10 paths, event logs, decryption
    - **Job System**: creation, progress tracking, cancellation, WebSocket updates, per-file progress, retry
    - **Export/Reporting**: CSV, JSON, HTML summary, ZIP packaging, BB section, case metadata, chain-of-custody
    - **Settings**: hash algorithm, scan config, export format, UI preferences, persistence
    - **Large File Handling**: streaming uploads, streaming reads, chunked processing, memory guards
    - **Plugin Architecture**: modular analyzers, signature registry, custom carving rules
  - Create `/external/run_checklist.sh` that greps JuiceSuite's codebase for evidence of each feature
  - Output: colored terminal report showing ✅ found / ❌ missing
  - Files: `/external/feature_checklist.json`, `/external/run_checklist.sh`
  - Acceptance: Running `bash /external/run_checklist.sh` produces a readable parity matrix

---

# Part 2: Architecture & Module Boundary Improvements

### T003: Refactor processors into modular analyzer architecture
- **Blocked By**: []
- **Details**:
  - Current state: `server/processors.ts` is a monolithic 600+ line file containing all processing functions
  - Split into dedicated analyzer modules under `server/analyzers/`:
    - `server/analyzers/mediaScanner.ts` — `scanMediaFiles()`, `classifyByName()`, duplicate logic
    - `server/analyzers/keywordSearch.ts` — `keywordSearch()` with text + hex
    - `server/analyzers/sqliteExplorer.ts` — `exploreSqlite()`
    - `server/analyzers/plistParser.ts` — `parsePlist()`
    - `server/analyzers/stringExtractor.ts` — `extractStrings()`
    - `server/analyzers/fileCarver.ts` — `carveMedia()` with extensible signature registry
    - `server/analyzers/archiveExtractor.ts` — `extractArchive()`
    - `server/analyzers/backupDetector.ts` — `detectBackups()`
    - `server/analyzers/reportGenerator.ts` — `generateReport()`
  - Keep `server/bbAnalyzer.ts` as-is (already modular)
  - Create `server/analyzers/index.ts` barrel export
  - Create `server/analyzers/types.ts` — shared `AnalyzerResult` interface
  - Update `server/routes.ts` imports; keep backward-compat re-exports in `processors.ts`
  - Files: `server/analyzers/*.ts`, `server/processors.ts`, `server/routes.ts`
  - Acceptance: All existing API endpoints still work; code is split into 9 focused modules

### T004: Create extensible signature registry for file carving
- **Blocked By**: [T003]
- **Details**:
  - Current: `carveMedia()` hardcodes only JPG and PNG signatures
  - Create `server/analyzers/signatures.ts` with registry pattern: `{ name, header, footer, maxSize, extension }`
  - Add built-in signatures: JPG, PNG, PDF (`%PDF`), ZIP (`PK\x03\x04`), GIF (`GIF89a`/`GIF87a`), BMP, TIFF, MP4 (`ftyp`), SQLite (`SQLite format 3`)
  - Update `carveMedia()` to iterate registry instead of hardcoded checks
  - Expose `GET /api/carve/signatures` endpoint
  - Add UI toggles in ArtifactAnalyzer carve panel to select which signatures to carve
  - Files: `server/analyzers/signatures.ts`, `server/analyzers/fileCarver.ts`, `server/routes.ts`, `client/src/pages/ArtifactAnalyzer.tsx`
  - Acceptance: Carving supports 9+ file types; user can select which types

---

# Part 3: High-Risk Missing Items

### T005: Fix large file streaming — eliminate readFileSync bottlenecks
- **Blocked By**: []
- **Details**:
  - **Critical risk**: `keywordSearch()`, `extractStrings()`, and `carveMedia()` all use `fs.readFileSync()` — will crash on files >1GB
  - Replace with streaming:
    - `keywordSearch()`: `fs.createReadStream()` with sliding window for cross-chunk boundary matching
    - `extractStrings()`: `fs.createReadStream()` with character accumulator
    - `carveMedia()`: `fs.createReadStream()` with overlapping chunk reads for header detection
  - Add memory guard: check `process.memoryUsage().heapUsed` before processing; reject files that would exceed 80% of available heap with clear error
  - Add `Content-Length` validation on upload to warn about oversized files before processing
  - Files: `server/processors.ts` (or `server/analyzers/*.ts` if T003 is done first)
  - Acceptance: Processing a 500MB file does not spike memory above 200MB; files >2GB rejected with clear message

### T006: Add per-file scan progress to Media Scanner UI
- **Blocked By**: []
- **Details**:
  - Current: Media scanning shows job-level progress only, no per-file feedback
  - Add WebSocket event `scan_file_progress`: `{ jobId, currentFile, fileIndex, totalFiles }`
  - Update `scanMediaFiles()` to emit this event as each file is classified
  - Add progress overlay in MediaScanner.tsx during upload:
    - Current file name being processed
    - "Processing file X of Y"
    - Individual file + overall progress bars
  - Staggered entrance animation as each media card appears in the grid
  - Files: `server/processors.ts`, `server/routes.ts`, `client/src/pages/MediaScanner.tsx`, `client/src/lib/store.tsx`
  - Acceptance: During multi-file scan, UI shows per-file progress and cards animate in

### T007: Persist settings to backend and wire to processors
- **Blocked By**: []
- **Details**:
  - Current: Settings page stores values in local React state only — resets on refresh, doesn't affect backend
  - Add `GET /api/settings` and `PUT /api/settings` endpoints
  - Add `settings` field to IStorage + MemStorage
  - Define settings schema in `shared/schema.ts`
  - Wire settings to processors:
    - `scanMediaFiles()` — use `hashAlgorithm`, respect `includeVideos`/`includeGifs`
    - `extractStrings()` — use `minStringLength`
    - `/api/media/export` — serve CSV or JSON based on `exportFormat`
  - Load settings on Settings page mount; save on "Save Settings" click; show toast on success
  - Files: `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `server/processors.ts`, `client/src/pages/Settings.tsx`
  - Acceptance: Changing hash algorithm causes next scan to use it; min string length affects extraction; export format toggle works

### T008: Add job retry, error recovery, and failure detail display
- **Blocked By**: []
- **Details**:
  - Current: Failed jobs show "Failed" with no detail; no retry mechanism
  - Add `errorMessage?: string` and `params?: Record<string, any>` to Job type
  - Add `POST /api/jobs/:id/retry` endpoint that re-runs with original parameters
  - Show error detail in JobQueue popover on failed jobs
  - Add "Retry" button on failed jobs
  - Add React error boundary at page level to prevent white-screen crashes
  - Files: `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `client/src/components/shared/JobQueue.tsx`, `client/src/App.tsx`
  - Acceptance: Failed jobs show error messages; retry re-runs the job; component errors caught by boundary

### T009: Add chain-of-custody and case metadata to reports
- **Blocked By**: []
- **Details**:
  - Forensic tools include case management fields that JuiceSuite lacks
  - Add to ReportDialog: Case Number, Investigator Name, Agency/Organization, Evidence Description, Chain of Custody notes, Date/Time of acquisition (auto-filled, editable), Report classification dropdown
  - Include all fields in HTML summary header of generated reports
  - Add SHA-256 hash of the complete report ZIP in the HTML summary footer (integrity verification)
  - Files: `client/src/components/shared/ReportDialog.tsx`, `server/processors.ts`, `shared/schema.ts`
  - Acceptance: Generated report includes case metadata and integrity hash

### T010: Add hex viewer panel to Artifact Analyzer
- **Blocked By**: []
- **Details**:
  - Forensic tools universally include hex viewing; JuiceSuite has `hexDump()` in bbAnalyzer but no user-facing viewer
  - Add "Hex Viewer" tab to ArtifactAnalyzer
  - Add `POST /api/hex/view` endpoint (file upload → hex dump, first 4KB default, paginated)
  - Add `GET /api/hex/view?offset=X&length=Y` for page-through
  - UI: classic hex layout — offset column, 16 hex bytes per row, ASCII column
  - Highlight printable vs non-printable; optionally color-code known magic bytes
  - Files: `server/routes.ts`, `client/src/pages/ArtifactAnalyzer.tsx`
  - Acceptance: User can upload a file and browse hex representation with offset navigation

---

# URL Validation Note

> **Important**: One or more of the "GitHub URLs" provided may actually be Replit project URLs. They cannot be `git clone`-d like GitHub repos.
> - **GitHub**: `https://github.com/<user>/<repo>` → clone with `git clone`
> - **Replit**: `https://replit.com/@<user>/<project>` → download via three-dot menu → "Download as ZIP"
> - **Test**: `curl -sI <URL> | head -5` — check for `server: GitHub.com` vs `server: Replit`
> - If a URL contains `replit.com`, `.repl.co`, or `.replit.app`, it's a Replit project
> - The Xcode repos (`JuiceLabProNative-Xcode`, `JuiceLabProNative-Xcode-CLONE`) may be local-only — confirm hosting location

---

# Task Dependency Graph
```
Independent: T001, T002, T005, T006, T007, T008, T009, T010
Sequential:  T003 → T004
```

# Recommended Execution Priority
1. **T005** — Large file streaming (critical crash risk on real forensic data)
2. **T007** — Settings persistence (settings page exists but does nothing)
3. **T006** — Per-file scan progress (major UX gap vs MediaScannerPro)
4. **T008** — Job retry + error display (robustness for forensic workflows)
5. **T003** — Modular analyzer architecture (enables T004 and future plugins)
6. **T004** — Extensible carving signatures (forensic depth)
7. **T009** — Chain-of-custody metadata (forensic credibility)
8. **T010** — Hex viewer (forensic tool parity)
9. **T001** — External repo scaffold (comparison tooling)
10. **T002** — Feature checklist runner (comparison automation)

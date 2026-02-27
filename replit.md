# JuiceSuite Forensic Dashboard

## Overview
JuiceSuite is a browser-based forensic analysis dashboard that merges MediaScannerPro and ArtifactAnalyzer capabilities into one unified app. All processing happens server-side with no external API calls.

## Architecture

### Frontend (React + Tailwind v4)
- **Framework**: React 19, Vite, wouter routing, TanStack Query
- **Styling**: Tailwind CSS v4, Apple-inspired dark UI
- **State**: Context-based store with WebSocket for real-time updates
- **Pages**: `/media-scanner`, `/artifact-analyzer`, `/settings`
- **Error Boundary**: Global ErrorBoundary in App.tsx prevents white-screen crashes

### Backend (Express + Node.js)
- **Server**: Express 5 with HTTP + WebSocket (ws)
- **Storage**: In-memory (MemStorage) with settings persistence - no database needed
- **File Upload**: multer with 2GB limit
- **Processing Modules** (`server/processors.ts`):
  - Media scanning with hash-based classification (Safe/Suggestive/Sexy/Explicit)
  - NSFW reason tags (nudity, lingerie, swimwear, suggestive_pose, skin_exposure, intimate_setting)
  - Confidence scores (70-100%) per media item
  - Per-file scan progress via WebSocket (`scan_file_progress`)
  - Settings-aware scanning (hashAlgorithm, includeVideos, includeGifs from stored settings)
  - Large file streaming: hashFileStreaming(), streaming keyword search, streaming string extraction, streaming file carving
  - 512MB sync threshold guard (MAX_FILE_SIZE_SYNC)
  - Keyword search (text + hex patterns) with streaming for large files
  - SQLite explorer (better-sqlite3)
  - Plist parser (plist npm)
  - Raw strings extraction from binaries
  - JPG/PNG file carving from raw data (+ streaming carve for large files)
  - Hex dump generation with offset navigation
  - Recursive ZIP extraction
  - iOS MobileSync + BlackBerry backup detection
  - Report generation with chain-of-custody metadata, case fields, integrity hash
- **BlackBerry Forensics** (`server/bbAnalyzer.ts`):
  - Backup format detection: IPD, BBBv1 (Mac), BBBv2 (Windows), BB10 BBB, BB10 TAR
  - Deep analysis of .rem, .key, .cod, .dat, .mkf, .ipd, .bbb files
  - REMF header detection, BBThumbs.dat parsing, encryption detection
  - Multi-method decryption (XOR, AES-128-CBC, 3DES-CBC)
  - BB10 forensic artifact path detection, date/time artifact decoding
  - Event log detection and entry counting
- **Analyzers** (`server/analyzers/`):
  - `types.ts` - Shared AnalyzerResult, ProgressCallback, FileProgressCallback interfaces
  - `signatures.ts` - Extensible file signature registry (JPG, PNG, PDF, ZIP, GIF, BMP, TIFF, SQLite)
  - `index.ts` - Barrel exports

### Key Directories
- `uploads/` - Uploaded files organized by workspace
- `output/` - Carved files and generated reports
- `external/` - Comparison tooling for related repos (compare.sh, feature_checklist.json)
- `client/src/pages/` - MediaScanner.tsx, ArtifactAnalyzer.tsx, Settings.tsx
- `client/src/components/layout/` - DashboardLayout.tsx (sidebar nav)
- `client/src/components/shared/` - JobQueue, LogsPanel, ReportDialog, DropZone, MediaDetailModal
- `server/processors.ts` - All server-side processing logic
- `server/bbAnalyzer.ts` - BlackBerry backup forensic analysis
- `server/analyzers/` - Modular analyzer types and signature registry
- `server/routes.ts` - API routes with WebSocket broadcasting

### API Endpoints
- `POST /api/upload` - File upload (media_scanner or artifact_analyzer workspace)
- `GET /api/media` - Get scanned media (optional ?category filter)
- `GET /api/media/stats` - Classification counts
- `GET /api/media/file/:id` - Serve uploaded media file as thumbnail
- `GET /api/media/export` - CSV export
- `GET /api/media/duplicates` - Get duplicate file groups by hash
- `POST /api/media/duplicates/remove` - Remove duplicate files (keeps one copy)
- `POST /api/search` - Keyword/hex search
- `POST /api/sqlite/explore` - Upload & explore SQLite DB
- `GET /api/sqlite/tables` / `GET /api/sqlite/rows/:table`
- `POST /api/plist/parse` - Upload & parse plist
- `POST /api/strings/extract` - Extract strings from binary
- `POST /api/carve` - JPG/PNG carving from raw data
- `GET /api/carve/signatures` - List all file carving signatures
- `PUT /api/carve/signatures/:name` - Enable/disable carving signature
- `POST /api/archive/extract` - Recursive ZIP extraction
- `GET /api/backups` - Detected backup targets
- `POST /api/bb/analyze` - BlackBerry backup forensic analysis
- `GET /api/bb/results/:sessionId` - Get BB analysis results
- `POST /api/bb/decrypt/:sessionId` - Attempt decryption of encrypted .rem files
- `POST /api/report` - Generate report ZIP with chain-of-custody metadata
- `GET /api/jobs` / `POST /api/jobs/:id/cancel` / `POST /api/jobs/:id/retry`
- `GET /api/logs` / `DELETE /api/logs`
- `GET /api/settings` / `PUT /api/settings` - Settings persistence
- `POST /api/hex/view` - Upload file for hex dump
- `GET /api/hex/view?file=&offset=&length=` - Paginated hex view

### WebSocket (`/ws`)
Real-time progress updates broadcast to all clients:
- `job_progress`, `job_update`, `scan_complete`, `search_complete`
- `scan_file_progress` - Per-file progress (currentFile, fileIndex, totalFiles)
- `sqlite_ready`, `plist_ready`, `strings_ready`, `carve_complete`
- `archive_extracted`, `backups_detected`, `report_ready`
- `bb_analysis_complete`, `bb_decrypt_complete`

### Feature Set
- NSFW reason tags per media item (nudity, lingerie, swimwear, etc.)
- Confidence scores (percentage) for classification
- Per-file scan progress overlay in MediaScanner UI
- Duplicate media detection with grouping, wasted space calculation, and removal
- Media detail modal with full-size preview, metadata, navigation
- Grid/List view toggle for media results
- Sort by name, size, category; filter by file type
- Category distribution bar chart (color-coded)
- Settings page with backend persistence (hash algorithm, scan settings, export format, UI preferences)
- Job retry for failed jobs with error message display
- Error boundary for crash prevention
- Hex viewer tab in Artifact Analyzer with offset navigation
- Extensible file signature registry for carving (9 built-in signatures)
- Chain-of-custody metadata in reports (case number, investigator, agency, evidence description, acquisition date, classification)
- Report integrity hash (SHA-256) in system logs
- BB forensics data included in report generation
- Large file streaming support (>512MB files processed in chunks)

### Dependencies (notable server-side)
- `multer` - File uploads
- `better-sqlite3` - SQLite database parsing
- `plist` - Property list parsing
- `archiver` - ZIP report generation
- `ws` - WebSocket server

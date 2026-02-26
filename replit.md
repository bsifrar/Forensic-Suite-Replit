# JuiceSuite Forensic Dashboard

## Overview
JuiceSuite is a browser-based forensic analysis dashboard that merges MediaScannerPro and ArtifactAnalyzer capabilities into one unified app. All processing happens server-side.

## Architecture

### Frontend (React + Tailwind v4)
- **Framework**: React 19, Vite, wouter routing, TanStack Query
- **Styling**: Tailwind CSS v4, Apple-inspired dark UI
- **State**: Context-based store with WebSocket for real-time updates
- **Pages**: `/media-scanner`, `/artifact-analyzer`

### Backend (Express + Node.js)
- **Server**: Express 5 with HTTP + WebSocket (ws)
- **Storage**: In-memory (MemStorage) - no database needed for ephemeral file processing
- **File Upload**: multer with 2GB limit
- **Processing Modules** (`server/processors.ts`):
  - Media scanning with hash-based classification (Safe/Suggestive/Sexy/Explicit)
  - Keyword search (text + hex patterns)
  - SQLite explorer (better-sqlite3)
  - Plist parser (plist npm)
  - Raw strings extraction from binaries
  - JPG/PNG file carving from raw data
  - Recursive ZIP extraction
  - iOS MobileSync + BlackBerry backup detection
  - Report generation (archiver → downloadable ZIP)
- **BlackBerry Forensics** (`server/bbAnalyzer.ts`):
  - Deep analysis of .rem, .key, .cod, .dat, .mkf files
  - Hex dump generation for key and data files
  - Encryption detection via entropy analysis
  - Multi-method decryption (XOR, AES-128-CBC, 3DES-CBC)
  - Contact/message/media signature counting
  - SQLite signature detection within encrypted databases

### Key Directories
- `uploads/` - Uploaded files organized by workspace
- `output/` - Carved files and generated reports
- `client/src/pages/` - MediaScanner.tsx, ArtifactAnalyzer.tsx
- `client/src/components/layout/` - DashboardLayout.tsx (sidebar nav)
- `client/src/components/shared/` - JobQueue, LogsPanel, ReportDialog
- `server/processors.ts` - All server-side processing logic
- `server/bbAnalyzer.ts` - BlackBerry backup forensic analysis
- `server/routes.ts` - API routes with WebSocket broadcasting

### API Endpoints
- `POST /api/upload` - File upload (media_scanner or artifact_analyzer workspace)
- `GET /api/media` - Get scanned media (optional ?category filter)
- `GET /api/media/stats` - Classification counts
- `GET /api/media/file/:id` - Serve uploaded media file as thumbnail
- `GET /api/media/export` - CSV export
- `POST /api/search` - Keyword/hex search
- `POST /api/sqlite/explore` - Upload & explore SQLite DB
- `GET /api/sqlite/tables` / `GET /api/sqlite/rows/:table`
- `POST /api/plist/parse` - Upload & parse plist
- `POST /api/strings/extract` - Extract strings from binary
- `POST /api/carve` - JPG/PNG carving from raw data
- `POST /api/archive/extract` - Recursive ZIP extraction
- `GET /api/backups` - Detected backup targets
- `POST /api/bb/analyze` - BlackBerry backup forensic analysis
- `GET /api/bb/results/:sessionId` - Get BB analysis results
- `POST /api/bb/decrypt/:sessionId` - Attempt decryption of encrypted .rem files
- `POST /api/report` - Generate report ZIP
- `GET /api/jobs` / `POST /api/jobs/:id/cancel`
- `GET /api/logs` / `DELETE /api/logs`

### WebSocket (`/ws`)
Real-time progress updates broadcast to all clients:
- `job_progress`, `job_update`, `scan_complete`, `search_complete`
- `sqlite_ready`, `plist_ready`, `strings_ready`, `carve_complete`
- `archive_extracted`, `backups_detected`, `report_ready`
- `bb_analysis_complete`, `bb_decrypt_complete`

### Dependencies (notable server-side)
- `multer` - File uploads
- `better-sqlite3` - SQLite database parsing
- `plist` - Property list parsing
- `archiver` - ZIP report generation
- `ws` - WebSocket server

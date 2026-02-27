# External Repositories for Comparison

This directory contains (or will contain) the source code for related projects to be used for parity checking and feature gap analysis against JuiceSuite.

## Repositories to Import

The following projects should be downloaded or cloned into their respective directories:

- `MediaScannerPro-MacOS-Replit`
- `MediaScannerPro-IOS-Replit`
- `Artifact-Analyzer-Replit`
- `JuiceLabPro-Replit`
- `Forensic-Suite-Replit`
- `JuiceLabProNative-Xcode`
- `JuiceLabProNative-Xcode-CLONE`

## How to Import

### Replit Projects
URLs like `https://replit.com/@username/project-name`
1. Open the Replit URL.
2. Click the three-dot menu (vertical ellipsis) in the file tree or header.
3. Select **"Download as ZIP"**.
4. Extract the ZIP content into the corresponding folder in `/external/`.

### GitHub Repositories
URLs like `https://github.com/username/repo-name`
1. Open a terminal.
2. Navigate to the project folder: `cd external/<folder-name>`
3. Run: `git clone https://github.com/username/repo-name .` (don't forget the dot at the end to clone into the current directory).

## URL Validation Guide

Before downloading, verify the source:

- **GitHub**: Returns `server: GitHub.com` when queried.
- **Replit**: Returns `server: Replit` when queried.
- **Test Command**: `curl -sI <URL> | head -5`

If a URL contains `replit.com`, `.repl.co`, or `.replit.app`, it is a **Replit project**, not a standard GitHub repo.

*Note: Xcode repos (`JuiceLabProNative-Xcode`, etc.) may be local-only or hosted privately. Please confirm hosting location if not provided.*

## Tooling

Use `./compare.sh` to generate a feature comparison report after the repos have been populated.

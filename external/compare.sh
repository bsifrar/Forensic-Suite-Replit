#!/bin/bash

# JuiceSuite Comparison Tool
# Extracts exported functions, routes, and UI components from external repos
# and compares them against JuiceSuite.

REPORT_FILE="comparison_report.txt"
echo "JuiceSuite Feature Comparison Report" > $REPORT_FILE
echo "Generated on: $(date)" >> $REPORT_FILE
echo "======================================" >> $REPORT_FILE

EXTERNAL_DIRS=(
    "MediaScannerPro-MacOS-Replit"
    "MediaScannerPro-IOS-Replit"
    "Artifact-Analyzer-Replit"
    "JuiceLabPro-Replit"
    "Forensic-Suite-Replit"
    "JuiceLabProNative-Xcode"
    "JuiceLabProNative-Xcode-CLONE"
)

extract_features() {
    local dir=$1
    echo "Processing $dir..."
    
    echo "--- $dir ---" >> $REPORT_FILE
    
    if [ ! -d "external/$dir" ] || [ -z "$(ls -A external/$dir | grep -v .gitkeep)" ]; then
        echo "Status: EMPTY (No files found)" >> $REPORT_FILE
        echo "" >> $REPORT_FILE
        return
    fi

    echo "Exported Functions:" >> $REPORT_FILE
    grep -rE "export (const|function|async function) [a-zA-Z0-9_]+" "external/$dir" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | sed -E 's/.*export (const|function|async function) ([a-zA-Z0-9_]+).*/  - \2/' | sort | uniq >> $REPORT_FILE

    echo "Route Definitions:" >> $REPORT_FILE
    grep -rE "app\.(get|post|put|delete|patch)\(['\"]/api/" "external/$dir" --include="*.ts" --include="*.js" 2>/dev/null | sed -E "s/.*app\.(get|post|put|delete|patch)\(['\"]([^'\"]+)['\"].*/  - [\1] \2/" | sort | uniq >> $REPORT_FILE
    grep -rE "router\.(get|post|put|delete|patch)\(['\"]/api/" "external/$dir" --include="*.ts" --include="*.js" 2>/dev/null | sed -E "s/.*router\.(get|post|put|delete|patch)\(['\"]([^'\"]+)['\"].*/  - [\1] \2/" | sort | uniq >> $REPORT_FILE

    echo "UI Components:" >> $REPORT_FILE
    grep -rE "export (default )?function ([A-Z][a-zA-Z0-9_]+)" "external/$dir" --include="*.tsx" --include="*.jsx" 2>/dev/null | sed -E 's/.*export (default )?function ([A-Z][a-zA-Z0-9_]+).*/  - \2/' | sort | uniq >> $REPORT_FILE
    grep -rE "export const [A-Z][a-zA-Z0-9_]+" "external/$dir" --include="*.tsx" --include="*.jsx" 2>/dev/null | sed -E 's/.*export const ([A-Z][a-zA-Z0-9_]+).*/  - \1/' | sort | uniq >> $REPORT_FILE

    echo "" >> $REPORT_FILE
}

# 1. Process External Repos
for dir in "${EXTERNAL_DIRS[@]}"; do
    extract_features "$dir"
done

# 2. Extract JuiceSuite current state
echo "--- JuiceSuite (Current) ---" >> $REPORT_FILE
echo "Exported Functions:" >> $REPORT_FILE
grep -rE "export (const|function|async function) [a-zA-Z0-9_]+" "server" "client/src" --include="*.ts" --include="*.tsx" 2>/dev/null | sed -E 's/.*export (const|function|async function) ([a-zA-Z0-9_]+).*/  - \2/' | sort | uniq >> $REPORT_FILE

echo "Route Definitions:" >> $REPORT_FILE
grep -rE "app\.(get|post|put|delete|patch)\(['\"]/api/" "server" --include="*.ts" 2>/dev/null | sed -E "s/.*app\.(get|post|put|delete|patch)\(['\"]([^'\"]+)['\"].*/  - [\1] \2/" | sort | uniq >> $REPORT_FILE

echo "UI Components:" >> $REPORT_FILE
grep -rE "export (default )?function ([A-Z][a-zA-Z0-9_]+)" "client/src" --include="*.tsx" 2>/dev/null | sed -E 's/.*export (default )?function ([A-Z][a-zA-Z0-9_]+).*/  - \2/' | sort | uniq >> $REPORT_FILE
grep -rE "export const [A-Z][a-zA-Z0-9_]+" "client/src" --include="*.tsx" 2>/dev/null | sed -E 's/.*export const ([A-Z][a-zA-Z0-9_]+).*/  - \1/' | sort | uniq >> $REPORT_FILE

echo "======================================" >> $REPORT_FILE
echo "Comparison report generated at $REPORT_FILE"

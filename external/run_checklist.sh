#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

CHECKLIST_FILE="/home/runner/workspace/external/feature_checklist.json"

if [ ! -f "$CHECKLIST_FILE" ]; then
    echo "Error: checklist file not found at $CHECKLIST_FILE"
    exit 1
fi

echo -e "${BOLD}JuiceSuite Feature Parity Checklist${NC}"
echo "=========================================="

# Read the checklist using node to parse JSON
# We iterate through categories and features
node -e "
const fs = require('fs');
const checklist = JSON.parse(fs.readFileSync('$CHECKLIST_FILE', 'utf8'));
const { execSync } = require('child_process');

for (const [category, features] of Object.entries(checklist)) {
    console.log('\n' + category.toUpperCase());
    console.log('-'.repeat(category.length));
    
    for (const [feature, pattern] of Object.entries(features)) {
        try {
            // Search in client and server directories
            // We use -E for extended regex and -i for case-insensitive
            const grepCmd = \`grep -riE \"\${pattern}\" client/src server/ shared/ | head -n 1\`;
            const result = execSync(grepCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            
            if (result.trim()) {
                console.log('\x1b[32m✅\x1b[0m ' + feature);
            } else {
                console.log('\x1b[31m❌\x1b[0m ' + feature);
            }
        } catch (e) {
            console.log('\x1b[31m❌\x1b[0m ' + feature);
        }
    }
}
"

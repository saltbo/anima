#!/bin/bash
# Diagnostic script for claude CLI
set -e

echo "=== 1. claude version ==="
claude --version 2>&1 || echo "FAILED"

echo ""
echo "=== 2. claude auth status ==="
claude auth status 2>&1 || echo "No auth command or not authenticated"

echo ""
echo "=== 3. Try with timeout (5s) ==="
timeout 5 claude --print "say hello" 2>&1 || echo "EXIT: $? (124=timeout, 1=error)"

echo ""
echo "=== 4. Try -p shorthand ==="
timeout 5 claude -p "say hello" 2>&1 || echo "EXIT: $? (124=timeout, 1=error)"

echo ""
echo "=== 5. Try with verbose/debug ==="
timeout 10 claude --print --debug "say hello" 2>&1 | head -50 || echo "EXIT: $? (124=timeout)"

echo ""
echo "=== 6. Check config ==="
ls -la ~/.claude/ 2>&1 | head -20
echo ""
cat ~/.claude/settings.json 2>&1 || echo "No settings.json"

echo ""
echo "=== Done ==="

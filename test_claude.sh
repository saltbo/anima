#!/bin/bash
echo "=== Stream JSON output test ==="
claude --print --verbose --output-format stream-json --include-partial-messages "say hello in one sentence" 2>&1
echo ""
echo "=== EXIT: $? ==="

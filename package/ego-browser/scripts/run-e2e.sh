#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== build =="
npm run build

echo "== E2E (handoff / waitForAgentControl) =="
EGO_BROWSER_E2E=1 node --test test/browser-e2e.test.js

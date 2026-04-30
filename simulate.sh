#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: RPC_URL=<rpc> bash simulate.sh <path-to-batch.json>"
  exit 1
fi

if [[ -z "${RPC_URL:-}" ]]; then
  echo "Error: RPC_URL environment variable is required"
  exit 1
fi

eval "$(bun encode.ts "$1")"
export SAFE_ADDRESS MULTISEND_CALLDATA

forge script script/SimulateSafe.s.sol \
  --fork-url "$RPC_URL" \
  -vvvv

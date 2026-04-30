#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ./simulate.sh <path-to-batch.json> [options]"
  echo ""
  echo "Options:"
  echo "  --safe-address <address>  Safe address (required if not in the JSON)"
  echo "  --chain-id <id>           Override the chain ID from the JSON"
  echo "  RPC_URL=<url>             Override the auto-detected RPC URL"
  echo ""
  echo "Examples:"
  echo "  ./simulate.sh payloads/batch.json"
  echo "  ./simulate.sh payloads/batch.json --safe-address 0x1234..."
  echo "  RPC_URL=https://my-rpc ./simulate.sh payloads/batch.json --chain-id 4326"
}

if [[ -z "${1:-}" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

eval "$(bun safe/resolve.ts "$@")"
export SAFE_ADDRESS MULTISEND_CALLDATA RPC_URL

forge script script/SimulateSafe.s.sol \
  --fork-url "$RPC_URL" \
  -vvvv

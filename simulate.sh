#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ./simulate.sh <path-to-batch.json> [options]"
  echo ""
  echo "Options:"
  echo "  --safe-address <address>  Safe address (required if not in the JSON)"
  echo "  --chain-id <id>           Override the chain ID from the JSON"
  echo "  -v|-vv|-vvv|-vvvv|-vvvvv  Trace verbosity (default: -vvvv)"
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

VERBOSITY="-vvvv"
ENCODE_ARGS=()

for arg in "$@"; do
  if [[ "$arg" =~ ^-v{1,5}$ ]]; then
    VERBOSITY="$arg"
  else
    ENCODE_ARGS+=("$arg")
  fi
done

eval "$(bun safe/resolve.ts "${ENCODE_ARGS[@]}")"
export SAFE_ADDRESS MULTISEND_CALLDATA RPC_URL

forge script script/SimulateSafe.s.sol \
  --fork-url "$RPC_URL" \
  "$VERBOSITY"

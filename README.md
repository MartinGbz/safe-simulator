# safe-simulator

Simulate a [Safe](https://safe.global) multisig transaction locally using Foundry — no Tenderly, no Safe UI required.

Useful when external simulation tools are unavailable (e.g. newly deployed chains, Tenderly outages, Safe frontend limitations).

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Bun](https://bun.sh)

## Setup

```bash
forge install
bun install
```

## Usage

Drop your Safe Transaction Builder JSON export into `payloads/`, then:

```bash
./simulate.sh payloads/your-batch.json
```

The RPC URL is auto-detected from the `chainId` in the JSON using viem's chain registry. Run `./simulate.sh --help` to see all options.

## Options

| Option | Description |
|--------|-------------|
| `--safe-address <address>` | Safe address to simulate against. Required when `meta.createdFromSafeAddress` is absent from the JSON. |
| `--chain-id <id>` | Override the chain ID from the JSON. |
| `-v` `-vv` `-vvv` `-vvvv` `-vvvvv` | Trace verbosity (default: `-vvvv`). |
| `RPC_URL=<url>` | Override the auto-detected RPC URL. Required for chains not in viem's registry. |

## Input format

The script expects a JSON export from Safe's Transaction Builder app (`New transaction → Transaction Builder → Export batch`). The Safe address is read from `meta.createdFromSafeAddress` if present, otherwise pass `--safe-address`.

## Interpreting the output

The default verbosity is `-vvvv`, printing the full call trace for every subcall. Use `-vv` for a concise summary (logs only) or `-vvvvv` for maximum detail including setup traces.

| Output | Meaning |
|--------|---------|
| `Simulation succeeded` | All inner transactions executed successfully |
| `GS013` | An inner transaction reverted — look at the trace above it for the revert reason |
| `GS026` | Signature check failed — shouldn't happen; verify the Safe address is correct |

**Decoding a custom error selector:**

```bash
# Query 4byte.directory (works for most public contracts)
cast 4byte 0xc0460cfb

# If you have the ABI of the reverting contract:
cast decode-error <full-revert-hex> --abi path/to/abi.json
```

The full revert hex is the complete data returned by the failing call in the trace — not just the 4-byte selector. Foundry prints it when a call reverts with data.

## How it works

1. **`safe/resolve.ts`** reads the JSON, encodes each inner transaction into `multiSend` calldata using viem's `encodeFunctionData`, and resolves the RPC URL from the payload's `chainId`.
2. **`script/SimulateSafe.s.sol`** forks the chain, overrides two Safe storage slots to bypass signature checks, and calls `execTransaction` via Foundry's `vm` cheatcodes.

The Safe signature bypass:
- `threshold` (slot 4) is overridden to `1`
- `approvedHashes[owner][txHash]` (slot 8 nested mapping) is set to `1`
- An [approved-hash signature](https://docs.safe.global/advanced/smart-account-signatures#approved-hash) (`v=1`) is passed — the Safe checks the storage slot instead of verifying a real ECDSA signature

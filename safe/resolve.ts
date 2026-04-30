import { readFileSync } from 'fs';
import { isAddress } from 'viem';
import * as viemChains from 'viem/chains';

import { encodeMultiSendCalldata, type SafeBatchFile } from './encode.ts';

function resolveRpcUrl(chainId: number): string | undefined {
  const chain = Object.values(viemChains).find(
    (c): c is (typeof viemChains)[keyof typeof viemChains] =>
      typeof c === 'object' && c !== null && 'id' in c && c.id === chainId,
  );
  if (!chain || !('rpcUrls' in chain)) return undefined;
  return chain.rpcUrls.default.http[0];
}

function getFlag(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  process.stderr.write(
    'Usage: bun safe/resolve.ts <path-to-batch.json> [--chain-id <id>] [--safe-address <address>]\n',
  );
  process.exit(1);
}

const chainIdFlag = getFlag(process.argv, '--chain-id');
const chainIdOverride = chainIdFlag !== undefined ? parseInt(chainIdFlag, 10) : undefined;
if (chainIdOverride !== undefined && isNaN(chainIdOverride))
  throw new Error(`Invalid --chain-id value: "${chainIdFlag}"`);

const safeAddressOverride = getFlag(process.argv, '--safe-address');

const batch: SafeBatchFile = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const chainId = chainIdOverride ?? parseInt(batch.chainId, 10);
const safeAddress = safeAddressOverride ?? batch.meta.createdFromSafeAddress;

if (isNaN(chainId)) throw new Error(`Invalid chainId in JSON: "${batch.chainId}"`);

if (!safeAddress) {
  process.stderr.write(
    `[safe-simulator] Safe address not found in JSON (meta.createdFromSafeAddress is missing).\n` +
      `  Pass it explicitly: --safe-address 0x...\n`,
  );
  process.exit(1);
}

if (!isAddress(safeAddress)) throw new Error(`Invalid Safe address: "${safeAddress}"`);

const envRpcUrl = process.env['RPC_URL'];
const resolvedRpcUrl = envRpcUrl ?? resolveRpcUrl(chainId);

if (!resolvedRpcUrl) {
  process.stderr.write(
    `[safe-simulator] Chain ${chainId} is not known to viem. Pass RPC_URL env var.\n`,
  );
  process.exit(1);
}

process.stderr.write(
  `[safe-simulator] Encoding ${batch.transactions.length} transaction(s) for Safe ${safeAddress} on chain ${chainId}\n`,
);
process.stderr.write(`[safe-simulator] RPC: ${resolvedRpcUrl}\n`);

const multiSendCalldata = encodeMultiSendCalldata(batch.transactions);

process.stdout.write(`SAFE_ADDRESS=${safeAddress}\n`);
process.stdout.write(`MULTISEND_CALLDATA=${multiSendCalldata}\n`);
process.stdout.write(`RPC_URL=${resolvedRpcUrl}\n`);

import { readFileSync } from 'fs';
import {
  type Abi,
  type AbiParameter,
  concat,
  encodeFunctionData,
  type Hex,
  isAddress,
  numberToHex,
  pad,
  parseAbi,
  size,
} from 'viem';

// ─── Types (mirrors masiv-accounting's SafeBatchFile) ───────────────────────

type ContractMethod = {
  inputs: readonly { name: string; type: string; internalType?: string; components?: unknown[] }[];
  name: string;
  payable: boolean;
};

type SafeTxBuilderTransaction = {
  to: string;
  value: string;
  data?: string | null;
  operation?: number;
  contractMethod?: ContractMethod | null;
  contractInputsValues?: Record<string, string> | null;
};

type SafeBatchFile = {
  meta: { createdFromSafeAddress: string };
  transactions: SafeTxBuilderTransaction[];
};

// ─── ABI encoding (mirrors encode-tx-builder.ts) ────────────────────────────

type AbiInput = { name: string; type: string; internalType?: string; components?: AbiInput[] };

function toAbiParam(input: AbiInput): AbiParameter {
  const param: AbiParameter = { name: input.name, type: input.type };
  if (input.components) {
    (param as AbiParameter & { components: AbiParameter[] }).components =
      input.components.map(toAbiParam);
  }
  return param;
}

function parseArgValue(value: string, type: string, inputName: string, fnName: string): unknown {
  if (type === 'tuple' || type.startsWith('tuple[')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Invalid JSON for tuple input "${inputName}" of function "${fnName}": ${value}`);
    }
  }
  return value;
}

function encodeTransaction(tx: SafeTxBuilderTransaction): Hex {
  // Raw calldata provided directly
  if (tx.data && tx.data !== '0x') return tx.data as Hex;

  if (!tx.contractMethod) throw new Error(`Transaction to ${tx.to} has no data and no contractMethod`);

  const inputs = tx.contractMethod.inputs as readonly AbiInput[];
  const abi: Abi = [
    {
      type: 'function',
      name: tx.contractMethod.name,
      inputs: inputs.map(toAbiParam),
      outputs: [],
      stateMutability: tx.contractMethod.payable ? 'payable' : 'nonpayable',
    },
  ];

  const inputValues = tx.contractInputsValues;
  const args = inputs.map((i) => {
    const raw = inputValues?.[i.name];
    if (raw === undefined)
      throw new Error(`Missing input "${i.name}" for function "${tx.contractMethod!.name}"`);
    return parseArgValue(raw, i.type, i.name, tx.contractMethod!.name);
  });

  return encodeFunctionData({ abi, functionName: tx.contractMethod.name, args });
}

// ─── MultiSend encoding (mirrors encodeMultiSendData) ───────────────────────

const MULTI_SEND_ABI = parseAbi(['function multiSend(bytes transactions) payable']);

function encodeMultiSendCalldata(transactions: SafeTxBuilderTransaction[]): Hex {
  const packed = transactions.map((tx) => {
    if (!isAddress(tx.to)) throw new Error(`Invalid address: "${tx.to}"`);
    const data = encodeTransaction(tx);
    const dataSize = size(data);
    const operation = tx.operation ?? 0;
    return concat([
      numberToHex(operation, { size: 1 }),
      pad(tx.to as Hex, { size: 20 }),
      pad(numberToHex(BigInt(tx.value), { size: 32 }), { size: 32 }),
      pad(numberToHex(dataSize, { size: 32 }), { size: 32 }),
      data,
    ]);
  });

  return encodeFunctionData({
    abi: MULTI_SEND_ABI,
    functionName: 'multiSend',
    args: [concat(packed)],
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: bun encode.ts <path-to-batch.json>');
  process.exit(1);
}

const batch: SafeBatchFile = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const safeAddress = batch.meta.createdFromSafeAddress;

if (!isAddress(safeAddress)) throw new Error(`Invalid Safe address in JSON: "${safeAddress}"`);

const multiSendCalldata = encodeMultiSendCalldata(batch.transactions);

console.log(`SAFE_ADDRESS=${safeAddress}`);
console.log(`MULTISEND_CALLDATA=${multiSendCalldata}`);

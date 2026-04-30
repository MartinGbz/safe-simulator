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

export type AbiInput = {
  name: string;
  type: string;
  internalType?: string;
  components?: AbiInput[];
};

export type ContractMethod = {
  inputs: readonly AbiInput[];
  name: string;
  payable: boolean;
};

export type SafeTxBuilderTransaction = {
  to: string;
  value: string;
  data?: string | null;
  operation?: number;
  contractMethod?: ContractMethod | null;
  contractInputsValues?: Record<string, string> | null;
};

export type SafeBatchFile = {
  chainId: string;
  meta: { createdFromSafeAddress?: string };
  transactions: SafeTxBuilderTransaction[];
};

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
      throw new Error(
        `Invalid JSON for tuple input "${inputName}" of function "${fnName}": ${value}`,
      );
    }
  }
  return value;
}

export function encodeTransaction(tx: SafeTxBuilderTransaction): Hex {
  if (tx.data && tx.data !== '0x') return tx.data as Hex;

  const contractMethod = tx.contractMethod;
  if (!contractMethod)
    throw new Error(`Transaction to ${tx.to} has no data and no contractMethod`);

  const inputs = contractMethod.inputs as readonly AbiInput[];
  const abi: Abi = [
    {
      type: 'function',
      name: contractMethod.name,
      inputs: inputs.map(toAbiParam),
      outputs: [],
      stateMutability: contractMethod.payable ? 'payable' : 'nonpayable',
    },
  ];

  const inputValues = tx.contractInputsValues;
  const args = inputs.map((i) => {
    const raw = inputValues?.[i.name];
    if (raw === undefined)
      throw new Error(`Missing input "${i.name}" for function "${contractMethod.name}"`);
    return parseArgValue(raw, i.type, i.name, contractMethod.name);
  });

  return encodeFunctionData({ abi, functionName: contractMethod.name, args });
}

const MULTI_SEND_ABI = parseAbi(['function multiSend(bytes transactions) payable']);

export function encodeMultiSendCalldata(transactions: SafeTxBuilderTransaction[]): Hex {
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

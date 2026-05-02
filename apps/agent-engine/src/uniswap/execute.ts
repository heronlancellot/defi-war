import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { defineChain } from 'viem'
import type { UniswapQuote } from './api.js'

// Unichain Testnet chain definition
const unichainTestnet = defineChain({
  id: 1301,
  name: 'Unichain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.UNICHAIN_TESTNET_RPC ?? 'https://sepolia.unichain.org'],
    },
  },
  testnet: true,
})

export interface SwapResult {
  txHash: string
  amountOut: string
}

export async function executeSwap(quote: UniswapQuote, privateKey: string): Promise<SwapResult> {
  if (!quote.methodParameters) {
    throw new Error('Quote does not contain methodParameters — cannot execute swap')
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)

  const walletClient = createWalletClient({
    account,
    chain: unichainTestnet,
    transport: http(),
  })

  const publicClient = createPublicClient({
    chain: unichainTestnet,
    transport: http(),
  })

  const { calldata, value, to } = quote.methodParameters

  const txHash = await walletClient.sendTransaction({
    to: to as `0x${string}`,
    data: calldata as `0x${string}`,
    value: BigInt(value ?? '0'),
  })

  // Wait for receipt to confirm
  await publicClient.waitForTransactionReceipt({ hash: txHash })

  return {
    txHash,
    amountOut: quote.output.amount,
  }
}

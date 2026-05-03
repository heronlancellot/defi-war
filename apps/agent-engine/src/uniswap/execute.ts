import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { defineChain } from 'viem'
import type { UniswapQuoteResponse } from './api.js'
import { getSwapTransaction } from './api.js'

const unichainTestnet = defineChain({
  id: 1301,
  name: 'Unichain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.UNICHAIN_RPC_URL ?? 'https://sepolia.unichain.org'] },
  },
  testnet: true,
})

export interface SwapResult {
  txHash: string
  amountOut: string
}

export async function executeSwap(quote: UniswapQuoteResponse, privateKey: string): Promise<SwapResult> {
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

  // Sign permit2 if required (ERC20 tokenIn like USDC)
  let signature: string | undefined
  if (quote.permitData) {
    const { domain, types, values } = quote.permitData
    // Remove EIP712Domain from types — viem adds it automatically
    const { EIP712Domain: _, ...signTypes } = types as any
    signature = await walletClient.signTypedData({
      account,
      domain: domain as any,
      types: signTypes,
      primaryType: 'PermitSingle',
      message: values as any,
    })
    console.log('[Uniswap] Permit2 signed')
  }

  // Get swap transaction calldata from Uniswap API
  const tx = await getSwapTransaction(quote, signature)

  if (!tx.data || tx.data === '0x') {
    throw new Error('Swap transaction has empty calldata')
  }

  // Broadcast on-chain
  const txHash = await walletClient.sendTransaction({
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value: BigInt(tx.value ?? '0'),
    ...(tx.gasLimit ? { gas: BigInt(tx.gasLimit) } : {}),
  })

  await publicClient.waitForTransactionReceipt({ hash: txHash })

  const outputAmount = (quote.quote as any)?.output?.amount ?? '0'

  return { txHash, amountOut: outputAmount }
}

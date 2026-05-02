import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

export function generateAgentWallet() {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  return {
    privateKey,
    address: account.address,
  }
}

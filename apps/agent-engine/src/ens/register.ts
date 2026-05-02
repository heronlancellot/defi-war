// ENS subname registration via offchain resolver (gasless for hackathon)
// Parent: arena.eth
// Subname: {agentName}.arena.eth
// SDK: @ensdomains/ensjs + viem

const ENS_PARENT = process.env.ENS_PARENT_NAME ?? 'arena.eth'

export async function registerAgentSubname(
  agentName: string,
  walletAddress: string,
  strategy: string,
): Promise<string> {
  const ensName = `${sanitizeName(agentName)}.${ENS_PARENT}`

  // If no ENS_OWNER_PRIVATE_KEY is set, return name without registering
  if (!process.env.ENS_OWNER_PRIVATE_KEY) {
    console.log(`[ENS] Skipping registration for ${ensName} (no ENS_OWNER_PRIVATE_KEY)`)
    return ensName
  }

  try {
    // TODO: implement real registration via @ensdomains/ensjs when arena.eth is configured
    // For now: log and return the name
    console.log(`[ENS] Would register: ${ensName} → ${walletAddress}`)
    console.log(`[ENS] Text record description: ${strategy.slice(0, 100)}`)
    return ensName
  } catch (err) {
    console.error(`[ENS] Registration failed for ${ensName}:`, err)
    return ensName
  }
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32)
}

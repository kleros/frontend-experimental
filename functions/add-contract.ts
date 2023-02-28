import { createClient } from '@supabase/supabase-js'

// Configuration
const PRE_SHARED_KEY = process.env.PRE_SHARED_KEY
const SUPABASE_KEY = process.env.SUPABASE_CLIENT_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SUPPORTED_NETWORKS = ["arbitrumGoerli", "goerli", "mainnet", "gnosischain", "chiado"] as const;

export const handler = async function(event: any, context: any) {
  const pre_shared_key = event.headers['pre_shared_key']
  // Verify JSON contains the key EOA and is a valid value //TODO 
  // Verify the pre-shared key
  if (pre_shared_key !== PRE_SHARED_KEY) {
    return {
      statusCode: 401,
      body: JSON.stringify({message: "Unauthorized"})
    }
  }
  const network = event.headers['network']
  if (!SUPPORTED_NETWORKS.includes(network)) {
    return {
      statusCode: 496,
      body: JSON.stringify({message: network + ": currently not a supported network."})
    }
  }
  const table = "sce-" + network
  const json = JSON.parse(event.body)
  const result = await supabase.from(table).upsert({ contract: json.address, abi: json.abi})
  // TODO result error handling
  return {
    statusCode: 200,
    body: JSON.stringify({message: "OK."})
  }
}

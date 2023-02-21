import { createClient } from '@supabase/supabase-js'

// Configuration
const PRE_SHARED_KEY = process.env.PRE_SHARED_KEY
const SUPABASE_KEY = process.env.SUPABASE_CLIENT_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const handler = async function(event: any, context: any) {
  const pre_shared_key = event.headers['pre_shared_key']
  const json = JSON.parse(event.body)
  // Verify JSON contains the key EOA and is a valid value //TODO 
  // Verify the pre-shared key
  if (pre_shared_key !== PRE_SHARED_KEY) {
    return {
      statusCode: 401,
      body: JSON.stringify({message: "Unauthorized"})
    }
  }
  const result = await supabase.from('users').upsert({ eoa: json.eoa, preferences: json.preferences})
  // TODO result error handling
  return {
    statusCode: 200,
    body: JSON.stringify({message: "Notification preferences set."})
  }
}


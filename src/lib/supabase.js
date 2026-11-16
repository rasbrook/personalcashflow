import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mhqmcdjntgsemmzfjzdy.supabase.co'
const supabasePublishableKey = 'sb_publishable_KP0n61SQdET5laMOR6ZHtA_7hmxWGtz'

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null

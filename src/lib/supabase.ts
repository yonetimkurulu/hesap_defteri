import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const remoteBackendEnabled = import.meta.env.VITE_ENABLE_REMOTE_BACKEND === 'true'

export const isSupabaseConfigured = remoteBackendEnabled && Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
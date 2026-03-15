import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

export const getSupabaseAdmin = () => {
  if (cachedClient) return cachedClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL en variables de entorno')
  }

  if (!serviceRoleKey) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno')
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return cachedClient
}

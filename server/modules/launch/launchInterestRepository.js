export function createLaunchInterestRepository({ getSupabaseAdmin }) {
  function client() {
    const supabase = getSupabaseAdmin?.()
    if (!supabase) {
      const error = new Error('Supabase Admin no está configurado.')
      error.status = 503
      throw error
    }
    return supabase
  }

  return {
    /**
     * Inserta o confirma el email. Idempotente por email único.
     * @returns {{ created: boolean, email: string }}
     */
    async upsertInterest({ email, source = 'launch_teaser', eventSlug = null }) {
      const normalizedEmail = String(email ?? '').trim().toLowerCase()
      const normalizedSource = String(source ?? 'launch_teaser').trim().slice(0, 80) || 'launch_teaser'
      const normalizedSlug = eventSlug ? String(eventSlug).trim().slice(0, 120) : null

      const { data: existing, error: lookupError } = await client()
        .from('launch_interest')
        .select('id, email')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (lookupError) throw lookupError
      if (existing) {
        return { created: false, email: existing.email }
      }

      const { data, error } = await client()
        .from('launch_interest')
        .insert({
          email: normalizedEmail,
          source: normalizedSource,
          event_slug: normalizedSlug,
        })
        .select('email')
        .single()

      if (error) {
        // Carrera: otro request insertó el mismo email.
        if (error.code === '23505') {
          return { created: false, email: normalizedEmail }
        }
        throw error
      }

      return { created: true, email: data.email }
    },
  }
}

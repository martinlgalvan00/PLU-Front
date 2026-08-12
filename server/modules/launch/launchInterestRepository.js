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
     * Inserta o confirma el email para una fuente especifica.
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
        .eq('source', normalizedSource)
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
        // Carrera: otro request insertó el mismo email+source.
        if (error.code === '23505') {
          return { created: false, email: normalizedEmail }
        }
        throw error
      }

      return { created: true, email: data.email }
    },

    /**
     * Devuelve el recuento de interesados agrupados por fuente (source).
     */
    async getSummary() {
      // Supabase RPC o un conteo agrupado es ideal. 
      // Si no hay RPC, traemos todos los registros relevantes y agrupamos en memoria
      // (asumiendo volumen moderado de waitlist). Para producción real con millones de filas,
      // se recomienda un view en postgres, pero aquí podemos agrupar.
      const { data, error } = await client()
        .from('launch_interest')
        .select('source, notified_at')
      
      if (error) throw error

      const grouped = {}
      for (const row of data) {
        const s = row.source
        if (!grouped[s]) {
          grouped[s] = { source: s, total: 0, pending: 0 }
        }
        grouped[s].total++
        if (!row.notified_at) {
          grouped[s].pending++
        }
      }

      return Object.values(grouped).sort((a, b) => b.pending - a.pending)
    },

    /**
     * Envia notificación a todos los usuarios pendientes de un source específico.
     * @returns {{ count: number }}
     */
    async notifySource(source, mailer) {
      if (!mailer) throw new Error('Mailer no inyectado')

      // 1. Obtener pendientes
      const { data: pending, error: fetchError } = await client()
        .from('launch_interest')
        .select('id, email, event_slug')
        .eq('source', source)
        .is('notified_at', null)

      if (fetchError) throw fetchError
      if (!pending || pending.length === 0) return { count: 0 }

      let notifiedCount = 0

      // 2. Enviar correos
      // NOTA: Para alto volumen, se debería encolar en un worker (ej. outbox pattern).
      // Aquí, como es un dispatch síncrono del dashboard admin, usamos un bucle.
      for (const record of pending) {
        try {
          await mailer.send({
            to: [{ email: record.email }],
            subject: '¡Novedades en Powerlifting United!',
            htmlContent: `
              <div style="font-family: sans-serif; color: #111;">
                <h2>¡Ya está disponible!</h2>
                <p>Te habías anotado para recibir un aviso sobre <strong>${source}</strong>.</p>
                <p>Ya puedes acceder a las novedades en la plataforma.</p>
                <br/>
                <p>Saludos,<br/>El equipo de PLU</p>
              </div>
            `,
            tags: ['launch_interest', source],
          })

          // 3. Marcar como notificado
          await client()
            .from('launch_interest')
            .update({ notified_at: new Date().toISOString() })
            .eq('id', record.id)
            
          notifiedCount++
        } catch (err) {
          console.error(`Failed to notify ${record.email} for ${source}:`, err)
          // Continúa con el siguiente, no rompemos el batch entero
        }
      }

      return { count: notifiedCount }
    }
  }
}

const { createClient } = require('@supabase/supabase-js')

function extractUserId(conversationId) {
  // Format: U{32charUUID}T{timestamp}
  if (!conversationId || !conversationId.startsWith('U')) return null
  const raw = conversationId.slice(1, 33) // 32 hex chars
  if (raw.length !== 32) return null
  // UUID formatına çevir: 8-4-4-4-12
  return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20,32)}`
}

module.exports = async (req, res) => {
  console.log('>>> CALLBACK V4 <<<')
  if (req.method === 'GET') return res.redirect(302, '/')

  let body = req.body || {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) }
    catch { body = Object.fromEntries(new URLSearchParams(body)) }
  }

  let token = (body.token || '').trim()
  try { token = decodeURIComponent(token) } catch {}

  const conversationId = body.conversationId || ''

  console.log('Token:', token ? token.slice(0,12)+'...' : 'YOK')
  console.log('ConversationId:', conversationId)
  console.log('Body keys:', Object.keys(body))

  if (!token) return res.redirect(302, '/urun?payment=error')

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // 1. pending_payments'tan bul
  let userId = null
  let slug   = null
  let kitType = 'advanced'

  try {
    const { data: pending } = await sb
      .from('pending_payments')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (pending) {
      userId  = pending.user_id
      slug    = pending.slug
      kitType = pending.kit_type || 'advanced'
      console.log('Pending bulundu — userId:', userId)
    } else {
      console.log('Pending bulunamadı, conversationId\'den çıkartılıyor...')
    }
  } catch (e) {
    console.error('Pending sorgu hatası (tablo yok?):', e.message)
  }

  // 2. Fallback: conversationId'den userId çıkar
  if (!userId && conversationId) {
    userId = extractUserId(conversationId)
    console.log('ConversationId\'den userId:', userId)
  }

  console.log('Final userId:', userId)
  console.log('Final slug:', slug)

  // Duplicate kontrolü
  const { data: existing } = await sb
    .from('kits')
    .select('id')
    .eq('payment_token', token)
    .maybeSingle()

  if (existing) {
    console.log('Duplicate — zaten var')
    return res.redirect(302, '/tibbi-profil?payment=success')
  }

  // Kit oluştur
  const finalSlug = slug || ('QR-' + token.slice(0,8).toUpperCase())
  const { error: kitErr } = await sb.from('kits').insert({
    user_id        : userId,
    slug           : finalSlug,
    activation_code: 'IYZ-' + token.slice(0, 8).toUpperCase(),
    kit_type       : kitType,
    is_active      : true,
    activated_at   : new Date().toISOString(),
    payment_token  : token,
    payment_amount : parseFloat(body.paidPrice || body.price || '0')
  })

  if (kitErr) console.error('Kit hatası:', kitErr.message)
  else {
    console.log('Kit oluşturuldu! userId:', userId, 'slug:', finalSlug)
    try {
      await sb.from('pending_payments').delete().eq('token', token)
    } catch(e) {}
  }

  return res.redirect(302, '/tibbi-profil?payment=success')
}

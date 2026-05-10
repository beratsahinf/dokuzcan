const { createClient } = require('@supabase/supabase-js')

function extractUserId(conversationId) {
  if (!conversationId || !conversationId.startsWith('U')) return null
  const raw = conversationId.slice(1, 33)
  if (raw.length !== 32) return null
  return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20,32)}`
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.redirect(302, '/')

  let body = req.body || {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) }
    catch { body = Object.fromEntries(new URLSearchParams(body)) }
  }

  let token = (body.token || '').trim()
  try { token = decodeURIComponent(token) } catch {}

  if (!token) return res.redirect(302, '/urun?payment=error')

  const conversationId = body.conversationId || ''
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // pending_payments'tan bilgileri al
  let userId = null, slug = null, kitType = 'advanced', orderData = {}
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
      try { orderData = JSON.parse(pending.order_data || '{}') } catch {}
    }
  } catch (e) { console.error('Pending hata:', e.message) }

  if (!userId && conversationId) userId = extractUserId(conversationId)

  // Duplicate kontrolü
  const { data: existing } = await sb
    .from('kits')
    .select('id')
    .eq('payment_token', token)
    .maybeSingle()

  if (existing) return res.redirect(302, '/tibbi-profil?payment=success')

  const finalSlug = slug || ('QR-' + token.slice(0,8).toUpperCase())
  const { error: kitErr } = await sb.from('kits').insert({
    user_id          : userId,
    slug             : finalSlug,
    activation_code  : 'IYZ-' + token.slice(0, 8).toUpperCase(),
    kit_type         : kitType,
    is_active        : true,
    activated_at     : new Date().toISOString(),
    payment_token    : token,
    payment_amount   : parseFloat(body.paidPrice || body.price || '0'),
    tc_kimlik        : orderData.tc_kimlik || null,
    full_name        : orderData.full_name || null,
    phone            : orderData.phone || null,
    shipping_address : orderData.shipping_address || null,
    shipping_city    : orderData.shipping_city || null,
    shipping_district: orderData.shipping_district || null,
    shipping_postal  : orderData.shipping_postal || null,
    status           : 'paid'
  })

  if (kitErr) console.error('Kit hatası:', kitErr.message)
  else {
    console.log('Kit + sipariş kaydedildi:', finalSlug)
    try { await sb.from('pending_payments').delete().eq('token', token) } catch {}
  }

  return res.redirect(302, '/tibbi-profil?payment=success')
}

const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.redirect(302, '/')

  let body = req.body || {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) }
    catch { body = Object.fromEntries(new URLSearchParams(body)) }
  }

  let token = body.token || ''
  try { token = decodeURIComponent(token) } catch {}
  token = token.trim()

  console.log('=== CALLBACK ===')
  console.log('Body:', JSON.stringify(body))
  console.log('Token:', token ? token.slice(0,12) + '...' : 'YOK')

  // Token yoksa gerçekten hata
  if (!token) {
    console.error('Token yok')
    return res.redirect(302, '/urun?payment=error')
  }

  // Token varsa ödeme alındı — kit oluştur
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // Pending payment'tan userId ve slug al
  const { data: pending } = await sb
    .from('pending_payments')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  console.log('Pending:', pending ? JSON.stringify(pending) : 'YOK')

  // Duplicate kontrolü
  const { data: existing } = await sb
    .from('kits')
    .select('id')
    .eq('payment_token', token)
    .maybeSingle()

  if (existing) {
    console.log('Zaten var')
    return res.redirect(302, '/tibbi-profil?payment=success')
  }

  const userId  = pending?.user_id || null
  const slug    = pending?.slug    || ('QR-' + token.slice(0,8).toUpperCase())
  const kitType = pending?.kit_type || 'advanced'

  const { error: kitErr } = await sb.from('kits').insert({
    user_id        : userId,
    slug,
    activation_code: 'IYZ-' + token.slice(0, 8).toUpperCase(),
    kit_type       : kitType,
    is_active      : true,
    activated_at   : new Date().toISOString(),
    payment_token  : token,
    payment_amount : parseFloat(body.paidPrice || body.price || '0')
  })

  if (kitErr) console.error('Kit hatası:', kitErr.message)
  else {
    console.log('Kit oluşturuldu! slug:', slug, 'userId:', userId)
    await sb.from('pending_payments').delete().eq('token', token)
  }

  return res.redirect(302, '/tibbi-profil?payment=success')
}

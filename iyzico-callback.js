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

  const mdStatus = String(body.mdStatus || body.status || '')

  console.log('=== CALLBACK ===')
  console.log('Token:', token ? token.slice(0,12) + '...' : 'YOK')
  console.log('mdStatus:', mdStatus)
  console.log('Body:', JSON.stringify(body))

  if (!token) {
    console.error('Token yok')
    return res.redirect(302, '/urun?payment=error')
  }

  // Açık başarısız işaret varsa reddet
  if (mdStatus === '0' || mdStatus === 'failure') {
    console.log('Ödeme başarısız: mdStatus =', mdStatus)
    return res.redirect(302, '/urun?payment=failed')
  }

  // Supabase'den pending payment'ı bul
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: pending, error: pendingErr } = await sb
    .from('pending_payments')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  console.log('Pending payment:', pending ? JSON.stringify(pending) : 'BULUNAMADI')

  if (pendingErr || !pending) {
    console.error('Pending payment bulunamadı:', pendingErr?.message)
    // Pending bulunamadı ama token var — yine de tibbi-profile gönder
    return res.redirect(302, '/tibbi-profil?payment=success&warn=no_pending')
  }

  const { user_id: userId, slug, kit_type: kitType } = pending

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
  const { error: kitErr } = await sb.from('kits').insert({
    user_id        : userId,
    slug,
    activation_code: 'IYZ-' + token.slice(0, 8).toUpperCase(),
    kit_type       : kitType || 'advanced',
    is_active      : true,
    activated_at   : new Date().toISOString(),
    payment_token  : token,
    payment_amount : parseFloat(body.paidPrice || body.price || '0')
  })

  if (kitErr) {
    console.error('Kit insert hatası:', kitErr.message)
  } else {
    console.log('Kit oluşturuldu:', slug, 'userId:', userId)
    // Pending'i temizle
    await sb.from('pending_payments').delete().eq('token', token)
  }

  return res.redirect(302, '/tibbi-profil?payment=success')
}

const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  console.log('>>> CALLBACK V3 ÇALIŞIYOR <<<')
  console.log('Method:', req.method)
  console.log('Body:', JSON.stringify(req.body))

  if (req.method === 'GET') return res.redirect(302, '/?cb=get')

  let body = req.body || {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) }
    catch { body = Object.fromEntries(new URLSearchParams(body)) }
  }

  const token = (body.token || '').trim()

  if (!token) {
    return res.redirect(302, '/urun?payment=error&v3=notoken')
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    const { data: pending } = await sb
      .from('pending_payments')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    const { data: existing } = await sb
      .from('kits')
      .select('id')
      .eq('payment_token', token)
      .maybeSingle()

    if (!existing) {
      await sb.from('kits').insert({
        user_id        : pending?.user_id || null,
        slug           : pending?.slug || ('QR-' + token.slice(0,8).toUpperCase()),
        activation_code: 'IYZ-' + token.slice(0, 8).toUpperCase(),
        kit_type       : pending?.kit_type || 'advanced',
        is_active      : true,
        activated_at   : new Date().toISOString(),
        payment_token  : token,
        payment_amount : parseFloat(body.paidPrice || body.price || '0')
      })
      if (pending) await sb.from('pending_payments').delete().eq('token', token)
    }
  } catch (e) {
    console.error('Hata:', e.message)
  }

  return res.redirect(302, '/tibbi-profil?payment=success&v=v3')
}

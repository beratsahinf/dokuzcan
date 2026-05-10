const Iyzipay = require('iyzipay')
const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.redirect(302, '/')

  // Body'yi güvenli şekilde al
  let body = req.body || {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) }
    catch { body = Object.fromEntries(new URLSearchParams(body)) }
  }

  // Token'ı URL-decode et ve temizle
  let token = body.token || ''
  try { token = decodeURIComponent(token) } catch {}
  token = token.trim()

  console.log('=== CALLBACK ===')
  console.log('Token var mı:', !!token)
  console.log('Token uzunluk:', token.length)
  console.log('Body keys:', Object.keys(body))
  console.log('Status (body):', body.status)

  if (!token) {
    console.error('Token yok!')
    return res.redirect(302, '/urun?payment=error')
  }

  const iyzipay = new Iyzipay({
    apiKey   : process.env.IYZICO_API_KEY,
    secretKey: process.env.IYZICO_SECRET_KEY,
    uri      : process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
  })

  iyzipay.checkoutForm.retrieve(
    { locale: 'tr', conversationId: body.conversationId || ('DC' + Date.now()), token },
    async (err, result) => {
      console.log('Retrieve err:', err ? JSON.stringify(err) : null)
      console.log('Retrieve result:', JSON.stringify(result))

      if (err) {
        console.error('iyzipay retrieve SDK hatası:', err)
        return res.redirect(302, '/urun?payment=error')
      }

      if (result.status !== 'success') {
        console.error('Retrieve başarısız:', result.errorCode, result.errorMessage)
        return res.redirect(302, '/urun?payment=failed')
      }

      if (result.paymentStatus !== 'SUCCESS') {
        console.error('paymentStatus:', result.paymentStatus)
        return res.redirect(302, '/urun?payment=failed')
      }

      // Ödeme başarılı
      try {
        const sb = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        )
        const slug   = result.basketId
        const userId = result.buyer?.id
        console.log('Kit oluşturuluyor:', slug, userId)

        const { error: kitErr } = await sb.from('kits').insert({
          user_id        : userId,
          slug,
          activation_code: 'IYZ-' + token.slice(0, 8).toUpperCase(),
          kit_type       : 'advanced',
          is_active      : true,
          activated_at   : new Date().toISOString(),
          payment_token  : token,
          payment_amount : parseFloat(result.paidPrice || 0)
        })

        if (kitErr) console.error('Kit insert hatası:', kitErr.message)
        else console.log('Kit başarıyla oluşturuldu!')

        return res.redirect(302, '/tibbi-profil?payment=success')
      } catch (e) {
        console.error('Supabase hatası:', e.message)
        return res.redirect(302, '/tibbi-profil?payment=success&warn=db')
      }
    }
  )
}

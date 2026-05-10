const Iyzipay = require('iyzipay')
const { createClient } = require('@supabase/supabase-js')

// Form-urlencoded body parser
function parseFormBody(body) {
  if (!body) return {}
  try {
    // JSON ise direkt parse et
    return JSON.parse(body)
  } catch {
    // form-urlencoded ise parse et
    return Object.fromEntries(new URLSearchParams(body))
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.redirect(302, '/')

  // Body'yi oku — Vercel bazen string bazen object döner
  let body = req.body
  if (typeof body === 'string') body = parseFormBody(body)

  const token = body?.token

  // Debug log
  console.log('Callback alındı. Token:', token ? token.slice(0,10) + '...' : 'YOK')
  console.log('Body keys:', Object.keys(body || {}))

  if (!token) {
    console.error('Token yok, body:', JSON.stringify(body))
    return res.redirect(302, '/urun?payment=error&reason=no_token')
  }

  const iyzipay = new Iyzipay({
    apiKey   : process.env.IYZICO_API_KEY,
    secretKey: process.env.IYZICO_SECRET_KEY,
    uri      : process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
  })

  iyzipay.checkoutForm.retrieve(
    { locale: 'tr', conversationId: 'DC' + Date.now(), token },
    async (err, result) => {
      console.log('iyzipay result status:', result?.status)
      console.log('iyzipay paymentStatus:', result?.paymentStatus)

      if (err) {
        console.error('iyzipay retrieve hatası:', err)
        return res.redirect(302, '/urun?payment=error&reason=retrieve_error')
      }

      if (result.status !== 'success') {
        console.error('Ödeme status başarısız:', result.errorMessage)
        return res.redirect(302, '/urun?payment=failed&reason=' + encodeURIComponent(result.errorMessage || ''))
      }

      if (result.paymentStatus !== 'SUCCESS') {
        console.error('paymentStatus başarısız:', result.paymentStatus)
        return res.redirect(302, '/urun?payment=failed&reason=' + encodeURIComponent(result.paymentStatus || ''))
      }

      // Ödeme başarılı — kit oluştur
      try {
        const sb = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        )

        const slug   = result.basketId
        const userId = result.buyer?.id

        if (!userId || !slug) {
          console.error('userId veya slug yok:', { userId, slug })
          return res.redirect(302, '/tibbi-profil?payment=success&warn=no_kit')
        }

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

        if (kitErr) {
          console.error('Kit insert hatası:', kitErr.message)
          // Ödeme tamam ama kit kaydı olmadı — yine de yönlendir
          return res.redirect(302, '/tibbi-profil?payment=success&warn=kit_error')
        }

        console.log('Kit başarıyla oluşturuldu:', slug)
        return res.redirect(302, '/tibbi-profil?payment=success')

      } catch (e) {
        console.error('Supabase hatası:', e.message)
        return res.redirect(302, '/tibbi-profil?payment=success&warn=db_error')
      }
    }
  )
}

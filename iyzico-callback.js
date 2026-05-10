// api/iyzico-callback.js
const Iyzipay = require('iyzipay')
const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.redirect(302, '/')

  const token = req.body?.token
  if (!token) return res.redirect(302, '/urun?payment=error')

  const iyzipay = new Iyzipay({
    apiKey   : process.env.IYZICO_API_KEY,
    secretKey: process.env.IYZICO_SECRET_KEY,
    uri      : process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
  })

  iyzipay.checkoutForm.retrieve({ locale: 'tr', token }, async (err, result) => {
    if (err || result.status !== 'success' || result.paymentStatus !== 'SUCCESS') {
      console.error('Ödeme başarısız:', err || result)
      return res.redirect(302, '/urun?payment=failed')
    }

    try {
      const sb = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      )

      const slug   = result.basketId
      const userId = result.buyer?.id

      await sb.from('kits').insert({
        user_id         : userId,
        slug,
        activation_code : 'IYZ-' + token.slice(0, 8).toUpperCase(),
        kit_type        : 'advanced',
        is_active       : true,
        activated_at    : new Date().toISOString(),
        payment_token   : token,
        payment_amount  : parseFloat(result.paidPrice)
      })

      return res.redirect(302, '/tibbi-profil?payment=success')
    } catch (e) {
      console.error('Kit kayıt hatası:', e)
      return res.redirect(302, '/urun?payment=kit_error')
    }
  })
}

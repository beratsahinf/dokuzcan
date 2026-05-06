// api/iyzico-callback.js
// iyzico ödeme sonucu burada işlenir
// Ödeme başarılıysa Supabase'de kit kaydı oluşturulur

const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
const API_KEY         = process.env.IYZICO_API_KEY
const SECRET_KEY      = process.env.IYZICO_SECRET_KEY
const SUPABASE_URL    = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY // Service role key (RLS bypass)

function generateAuthString(apiKey, secretKey, randomStr, requestBody) {
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(apiKey + randomStr + JSON.stringify(requestBody))
    .digest('base64')
  return `IYZWS apiKey:${apiKey}, randomKey:${randomStr}, signature:${hash}`
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method !== 'POST') {
    // GET isteği → kullanıcıyı yönlendir
    return res.redirect(302, '/')
  }

  try {
    const token = req.body?.token

    if (!token) {
      return res.redirect(302, '/urun?payment=error')
    }

    // iyzico'ya token ile ödeme sonucunu sorgula
    const randomStr   = Math.random().toString(36).substring(2) + Date.now()
    const requestBody = { locale: 'tr', token }
    const authStr     = generateAuthString(API_KEY, SECRET_KEY, randomStr, requestBody)

    const response = await fetch(`${IYZICO_BASE_URL}/payment/iyzipos/checkoutform/auth/ecom/detail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authStr,
        'x-iyzi-rnd': randomStr,
        'x-iyzi-client-version': 'iyzipay-node-2.0.52'
      },
      body: JSON.stringify(requestBody)
    })

    const data = await response.json()

    if (data.status !== 'success' || data.paymentStatus !== 'SUCCESS') {
      console.error('Ödeme başarısız:', data)
      return res.redirect(302, '/urun?payment=failed')
    }

    // Ödeme başarılı — Supabase'e kit kaydı oluştur
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const basketId = data.basketId           // slug olarak kullandık
    const buyerId  = data.buyer?.id          // userId

    // Kit kaydı — slugu basketId'den al
    const { error: kitError } = await sb.from('kits').insert({
      user_id: buyerId,
      slug: basketId,
      activation_code: 'IYZ-' + token.slice(0, 8).toUpperCase(),
      kit_type: 'advanced',               // TODO: req.body'den al veya conversationId'den parse et
      is_active: true,
      activated_at: new Date().toISOString(),
      payment_token: token,
      payment_amount: data.paidPrice
    })

    if (kitError) {
      console.error('Kit kaydı hatası:', kitError.message)
      return res.redirect(302, '/urun?payment=kit_error')
    }

    // Başarı — kullanıcıyı tıbbi profile yönlendir
    return res.redirect(302, '/tibbi-profil?payment=success')

  } catch (err) {
    console.error('iyzico-callback hatası:', err)
    return res.redirect(302, '/urun?payment=error')
  }
}

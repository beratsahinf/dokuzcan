// api/iyzico-init.js
// Vercel Serverless Function — iyzico ödeme formu token'ı üretir
// Bu dosya /api/ klasörüne gitmeli (Vercel otomatik tanır)

const crypto = require('crypto')

const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
const API_KEY         = process.env.IYZICO_API_KEY    // Vercel env variable
const SECRET_KEY      = process.env.IYZICO_SECRET_KEY // Vercel env variable

// iyzico HMAC-SHA256 imza üretici
function generateAuthString(apiKey, secretKey, randomStr, requestBody) {
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(apiKey + randomStr + JSON.stringify(requestBody))
    .digest('base64')
  return `IYZWS apiKey:${apiKey}, randomKey:${randomStr}, signature:${hash}`
}

// Benzersiz slug üret
function generateSlug() {
  const uuid = crypto.randomUUID().replace(/-/g, '').toUpperCase()
  return uuid.slice(0, 4) + '-' + uuid.slice(4, 8) + '-' + uuid.slice(8, 12)
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const {
      userId,       // Supabase user id
      kitType,      // 'basic' | 'advanced' | 'pro'
      email,
      firstName,
      lastName,
      phone,
      price,        // Fiyat (string, örn: "2290.00")
      currency = 'TRY'
    } = req.body

    if (!userId || !email || !price || !kitType) {
      return res.status(400).json({ error: 'Eksik parametre: userId, email, price, kitType gerekli' })
    }

    const randomStr   = Math.random().toString(36).substring(2) + Date.now()
    const conversationId = 'DC-' + Date.now() + '-' + userId.slice(0, 8)
    const slug        = generateSlug()

    // iyzico CheckoutForm başlatma isteği
    const requestBody = {
      locale: 'tr',
      conversationId,
      price: price,
      paidPrice: price,
      currency,
      basketId: slug,                     // Siparişi slug ile ilişkilendir
      paymentGroup: 'PRODUCT',
      callbackUrl: process.env.IYZICO_CALLBACK_URL, // örn: https://dokuzcan.com/api/iyzico-callback
      enabledInstallments: [1, 2, 3],
      buyer: {
        id: userId,
        name: firstName || 'Misafir',
        surname: lastName || 'Kullanıcı',
        email: email,
        identityNumber: '11111111111',    // Test: TC kimlik no
        registrationAddress: 'Türkiye',
        city: 'İstanbul',
        country: 'Turkey',
        gsmNumber: phone || '+905000000000'
      },
      shippingAddress: {
        contactName: (firstName || 'Misafir') + ' ' + (lastName || ''),
        city: 'İstanbul',
        country: 'Turkey',
        address: 'Türkiye',
      },
      billingAddress: {
        contactName: (firstName || 'Misafir') + ' ' + (lastName || ''),
        city: 'İstanbul',
        country: 'Turkey',
        address: 'Türkiye',
      },
      basketItems: [{
        id: kitType + '-kit',
        name: 'DOKUZCAN ' + kitType.toUpperCase() + ' Motosiklet Travma Kiti',
        category1: 'Güvenlik',
        category2: 'Motosiklet Ekipmanı',
        itemType: 'PHYSICAL',
        price: price,
      }]
    }

    const authStr = generateAuthString(API_KEY, SECRET_KEY, randomStr, requestBody)

    const response = await fetch(`${IYZICO_BASE_URL}/payment/iyzipos/checkoutform/initialize/auth/ecom`, {
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

    if (data.status !== 'success') {
      return res.status(400).json({ error: data.errorMessage || 'iyzico hatası', raw: data })
    }

    // Token ve slug'ı döndür — slug Supabase'e kaydedilecek ödeme tamamlandıktan sonra
    return res.status(200).json({
      checkoutFormContent: data.checkoutFormContent,
      token: data.token,
      slug,
      conversationId
    })

  } catch (err) {
    console.error('iyzico-init hatası:', err)
    return res.status(500).json({ error: err.message })
  }
}

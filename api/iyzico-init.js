const Iyzipay = require('iyzipay')
const crypto  = require('crypto')
const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  const { userId, email, firstName, lastName, phone, kitType, price } = req.body
  if (!userId || !email || !price || !kitType) {
    return res.status(400).json({ error: 'Eksik parametre' })
  }

  const priceStr = parseFloat(price).toFixed(2)
  const callbackUrl = process.env.IYZICO_CALLBACK_URL || 'https://dokuzcan.com/api/iyzico-callback'
  const slug = crypto.randomBytes(6).toString('hex').toUpperCase().slice(0,4) + '-' +
               crypto.randomBytes(6).toString('hex').toUpperCase().slice(0,4) + '-' +
               crypto.randomBytes(6).toString('hex').toUpperCase().slice(0,4)
  const conversationId = 'DC' + Date.now()

  const iyzipay = new Iyzipay({
    apiKey   : process.env.IYZICO_API_KEY,
    secretKey: process.env.IYZICO_SECRET_KEY,
    uri      : process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
  })

  const kitNames = { basic: 'CITY Kit', advanced: 'TOUR Kit', pro: 'OFF-ROAD Kit' }

  const request = {
    locale             : Iyzipay.LOCALE.TR,
    conversationId,
    price              : priceStr,
    paidPrice          : priceStr,
    currency           : Iyzipay.CURRENCY.TRY,
    basketId           : slug,
    paymentGroup       : Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl,
    enabledInstallments: [1, 2, 3, 6],
    buyer: {
      id                 : userId,
      name               : (firstName || 'Kullanici').replace(/[^\w\s]/gi, ''),
      surname            : (lastName  || 'Dokuzcan').replace(/[^\w\s]/gi, ''),
      email,
      identityNumber     : '11111111111',
      registrationAddress: 'Turkiye',
      city               : 'Istanbul',
      country            : 'Turkey',
      gsmNumber          : (phone || '+905000000000').replace(/[^0-9+]/g, '')
    },
    shippingAddress: {
      contactName: ((firstName || 'K') + ' ' + (lastName || 'D')).replace(/[^\w\s]/gi, ''),
      city: 'Istanbul', country: 'Turkey', address: 'Turkiye'
    },
    billingAddress: {
      contactName: ((firstName || 'K') + ' ' + (lastName || 'D')).replace(/[^\w\s]/gi, ''),
      city: 'Istanbul', country: 'Turkey', address: 'Turkiye'
    },
    basketItems: [{
      id       : kitType + '-kit',
      name     : kitNames[kitType] || 'DOKUZCAN Kit',
      category1: 'Guvenlik',
      itemType : Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
      price    : priceStr
    }]
  }

  iyzipay.checkoutFormInitialize.create(request, async (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'SDK hatası: ' + (err.message || JSON.stringify(err)) })
    }
    if (result.status !== 'success') {
      return res.status(400).json({ error: result.errorMessage, code: result.errorCode })
    }

    // Token → userId eşleşmesini Supabase'e kaydet
    try {
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      await sb.from('pending_payments').insert({
        token  : result.token,
        user_id: userId,
        slug,
        kit_type: kitType
      })
    } catch (e) {
      console.error('Pending payment kayıt hatası:', e.message)
    }

    return res.status(200).json({
      checkoutFormContent: result.checkoutFormContent,
      token              : result.token,
      slug,
      conversationId
    })
  })
}

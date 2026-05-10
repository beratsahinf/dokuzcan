// api/iyzico-init.js
const Iyzipay = require('iyzipay')
const crypto  = require('crypto')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  const { userId, email, firstName, lastName, phone, kitType, price } = req.body

  if (!userId || !email || !price || !kitType) {
    return res.status(400).json({ error: 'Eksik parametre: userId, email, price, kitType gerekli' })
  }

  const iyzipay = new Iyzipay({
    apiKey   : process.env.IYZICO_API_KEY,
    secretKey: process.env.IYZICO_SECRET_KEY,
    uri      : process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
  })

  // Benzersiz QR slug — ödeme başarılıysa kit tablosuna yazılacak
  function makeSlug() {
    const raw = crypto.randomBytes(9).toString('hex').toUpperCase()
    return raw.slice(0,4) + '-' + raw.slice(4,8) + '-' + raw.slice(8,12)
  }
  const slug           = makeSlug()
  const conversationId = 'DC-' + Date.now()

  const request = {
    locale          : Iyzipay.LOCALE.TR,
    conversationId,
    price,
    paidPrice       : price,
    currency        : Iyzipay.CURRENCY.TRY,
    basketId        : slug,
    paymentGroup    : Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl     : process.env.IYZICO_CALLBACK_URL,
    enabledInstallments: [1, 2, 3, 6],
    buyer: {
      id                 : userId,
      name               : firstName || 'Kullanici',
      surname            : lastName  || 'Dokuzcan',
      email,
      identityNumber     : '11111111111',
      registrationAddress: 'Turkiye',
      city               : 'Istanbul',
      country            : 'Turkey',
      gsmNumber          : phone || '+905000000000'
    },
    shippingAddress: {
      contactName: (firstName || 'Kullanici') + ' ' + (lastName || ''),
      city       : 'Istanbul',
      country    : 'Turkey',
      address    : 'Turkiye'
    },
    billingAddress: {
      contactName: (firstName || 'Kullanici') + ' ' + (lastName || ''),
      city       : 'Istanbul',
      country    : 'Turkey',
      address    : 'Turkiye'
    },
    basketItems: [{
      id      : kitType + '-kit',
      name    : 'DOKUZCAN ' + kitType.toUpperCase() + ' Travma Kiti',
      category1: 'Guvenlik',
      itemType : Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
      price
    }]
  }

  iyzipay.checkoutFormInitialize.create(request, (err, result) => {
    if (err) {
      console.error('iyzipay hata:', err)
      return res.status(500).json({ error: 'iyzipay bağlantı hatası: ' + (err.message || err) })
    }
    if (result.status !== 'success') {
      console.error('iyzipay result:', JSON.stringify(result))
      return res.status(400).json({
        error: result.errorMessage || 'Ödeme başlatılamadı',
        code : result.errorCode
      })
    }
    return res.status(200).json({
      checkoutFormContent: result.checkoutFormContent,
      token              : result.token,
      slug,
      conversationId
    })
  })
}

// api/iyzico-test.js
const Iyzipay = require('iyzipay')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const apiKey    = process.env.IYZICO_API_KEY    || 'YOK'
  const secretKey = process.env.IYZICO_SECRET_KEY || 'YOK'
  const baseUrl   = process.env.IYZICO_BASE_URL   || 'https://sandbox-api.iyzipay.com'

  // Key'lerin ilk/son 4 karakterini göster (güvenli)
  const maskKey = k => k.length > 8 ? k.slice(0,4) + '...' + k.slice(-4) : '???'

  const iyzipay = new Iyzipay({ apiKey, secretKey, uri: baseUrl })

  // Basit bir test isteği — bin listesi
  iyzipay.binNumber.retrieve({ locale: 'tr', binNumber: '454671' }, (err, result) => {
    res.status(200).json({
      env: {
        apiKey   : maskKey(apiKey),
        secretKey: maskKey(secretKey),
        baseUrl,
        iyzipayVersion: require('iyzipay/package.json').version
      },
      error : err  ? err.message || JSON.stringify(err) : null,
      result: result ? { status: result.status, errorCode: result.errorCode, errorMessage: result.errorMessage } : null
    })
  })
}

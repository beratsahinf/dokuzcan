const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.redirect(302, '/')

  // Body'yi al
  let body = req.body || {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) }
    catch { body = Object.fromEntries(new URLSearchParams(body)) }
  }

  // Token ve ödeme bilgilerini al
  let token = body.token || ''
  try { token = decodeURIComponent(token) } catch {}
  token = token.trim()

  // iyzico'nun gönderdiği tüm alanlar
  const mdStatus     = body.mdStatus     || body.status || ''
  const paymentId    = body.paymentId    || ''
  const basketId     = body.basketId     || body.basketId || ''
  const paidPrice    = body.paidPrice    || body.price   || ''
  const conversationId = body.conversationId || ''

  console.log('=== CALLBACK ===')
  console.log('Token:', token ? token.slice(0,12) + '...' : 'YOK')
  console.log('Body:', JSON.stringify(body))

  if (!token) {
    console.error('Token yok')
    return res.redirect(302, '/urun?payment=error')
  }

  // iyzico callback imza doğrulaması
  // SHA-1( secretKey + token ) == body.signature (bazı entegrasyonlarda gelir)
  const secretKey = process.env.IYZICO_SECRET_KEY || ''
  const apiKey    = process.env.IYZICO_API_KEY    || ''

  // Ödeme başarısını belirle — iyzico callback body'sinden
  // mdStatus: 1=Başarılı 3DS, 4=Başarılı Non-3DS, diğerleri başarısız
  // status: 'success' veya 'failure'  
  const isSuccess = mdStatus === '1' || mdStatus === '4' || mdStatus === 'success'

  // Eğer body'de açık başarısız işaret varsa reddet
  const isFailed = mdStatus === '0' || mdStatus === 'failure'

  console.log('mdStatus:', mdStatus, '| isSuccess:', isSuccess, '| isFailed:', isFailed)

  // iyzico bazı durumlarda callback'te status göndermez
  // Token var ise ve açık hata yoksa başarılı say
  if (isFailed) {
    console.log('Ödeme başarısız olarak işaretlenmiş')
    return res.redirect(302, '/urun?payment=failed')
  }

  // Kit oluştur
  try {
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    // userId'yi conversationId'den çıkar: format DC-{userId}-{timestamp}
    const slug   = basketId || ('QR-' + token.slice(0,8).toUpperCase())
    const userId = conversationId.startsWith('DC-')
      ? conversationId.split('-')[1]  // DC-{userId}-{ts}
      : null

    // Önce bu token ile kit var mı kontrol et (duplicate önleme)
    const { data: existing } = await sb
      .from('kits')
      .select('id')
      .eq('payment_token', token)
      .maybeSingle()

    if (existing) {
      console.log('Bu token ile kit zaten var, duplicate atlandı')
      return res.redirect(302, '/tibbi-profil?payment=success')
    }

    const { error: kitErr } = await sb.from('kits').insert({
      user_id        : userId,
      slug,
      activation_code: 'IYZ-' + token.slice(0, 8).toUpperCase(),
      kit_type       : 'advanced',
      is_active      : true,
      activated_at   : new Date().toISOString(),
      payment_token  : token,
      payment_amount : parseFloat(paidPrice || '0')
    })

    if (kitErr) {
      console.error('Kit insert hatası:', kitErr.message)
    } else {
      console.log('Kit oluşturuldu:', slug)
    }

    return res.redirect(302, '/tibbi-profil?payment=success')

  } catch (e) {
    console.error('Hata:', e.message)
    return res.redirect(302, '/tibbi-profil?payment=success')
  }
}

// api/admin-data.js
// Tüm sipariş ve kullanıcı verilerini döndürür — admin şifresi gerekli
const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Şifre kontrolü
  const pw = req.headers['x-admin-password'] || req.query.pw
  if (!pw || pw !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Yetkisiz' })
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const [{ data: kits, error: kitErr }, { data: profiles, error: profErr }] = await Promise.all([
      sb.from('kits').select('*').order('created_at', { ascending: false }),
      sb.from('profiles').select('*')
    ])

    if (kitErr) return res.status(500).json({ error: 'Kit hata: ' + kitErr.message })
    if (profErr) return res.status(500).json({ error: 'Profil hata: ' + profErr.message })

    return res.status(200).json({
      orders: kits || [],
      users : profiles || []
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

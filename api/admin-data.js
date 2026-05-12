// api/admin-data.js
const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const pw = req.headers['x-admin-password'] || req.query.pw
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz' })

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    const [kitsRes, profilesRes, pendingRes, medicalRes, authRes] = await Promise.all([
      sb.from('kits').select('*').order('created_at', { ascending: false }),
      sb.from('profiles').select('*').order('created_at', { ascending: false }),
      sb.from('pending_payments').select('*').order('created_at', { ascending: false }),
      sb.from('medical_data').select('*'),
      sb.auth.admin.listUsers({ perPage: 1000 })
    ])

    // E-postaları profile birleştir
    const authUsers = (authRes.data?.users || [])
    const profiles  = (profilesRes.data || []).map(p => {
      const a = authUsers.find(u => u.id === p.id)
      return {
        ...p,
        email     : a?.email || null,
        created_at: p.created_at || a?.created_at || null,
        last_sign_in: a?.last_sign_in_at || null
      }
    })

    // Profile kaydı olmayan auth user'ları da ekle (silinmiş profiller için)
    authUsers.forEach(a => {
      if (!profiles.find(p => p.id === a.id)) {
        profiles.push({
          id: a.id, email: a.email,
          first_name: '(Profil yok)', last_name: '',
          created_at: a.created_at, last_sign_in: a.last_sign_in_at
        })
      }
    })

    return res.status(200).json({
      orders  : kitsRes.data || [],
      users   : profiles,
      pending : pendingRes.data || [],
      medical : medicalRes.data || []
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

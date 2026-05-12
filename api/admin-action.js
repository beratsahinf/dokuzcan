// api/admin-action.js
// Tüm admin işlemleri: kit oluştur, kullanıcı güncelle, sil, vs.
const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

function makeSlug() {
  const r = crypto.randomBytes(9).toString('hex').toUpperCase()
  return r.slice(0,4) + '-' + r.slice(4,8) + '-' + r.slice(8,12)
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const pw = req.headers['x-admin-password']
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz' })

  const { action, data } = req.body
  if (!action) return res.status(400).json({ error: 'action gerekli' })

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  try {
    switch (action) {
      case 'update-order': {
        const { orderId, status, shipping_company, tracking_number, admin_notes, payment_amount } = data
        if (!orderId) return res.status(400).json({ error: 'orderId gerekli' })
        const upd = {}
        if (status !== undefined)            upd.status           = status
        if (shipping_company !== undefined)  upd.shipping_company = shipping_company || null
        if (tracking_number !== undefined)   upd.tracking_number  = tracking_number || null
        if (admin_notes !== undefined)       upd.admin_notes      = admin_notes || null
        if (payment_amount !== undefined)    upd.payment_amount   = parseFloat(payment_amount) || 0
        if (status === 'shipped' && tracking_number) upd.shipped_at = new Date().toISOString()
        if (status === 'delivered') upd.delivered_at = new Date().toISOString()
        const { error } = await sb.from('kits').update(upd).eq('id', orderId)
        if (error) throw error
        return res.json({ success: true })
      }

      case 'create-kit': {
        const { user_id, kit_type, status, shipping_address, shipping_city, shipping_district, shipping_postal, phone, tc_kimlik, full_name, payment_amount, admin_notes } = data
        if (!user_id || !kit_type) return res.status(400).json({ error: 'user_id ve kit_type gerekli' })
        let slug
        for (let i = 0; i < 10; i++) {
          slug = makeSlug()
          const { data: exist } = await sb.from('kits').select('id').eq('slug', slug).maybeSingle()
          if (!exist) break
        }
        const { error } = await sb.from('kits').insert({
          user_id, slug, kit_type,
          activation_code : 'MANUAL-' + slug.slice(0,4),
          is_active       : true,
          activated_at    : new Date().toISOString(),
          status          : status || 'paid',
          shipping_address: shipping_address || null,
          shipping_city   : shipping_city || null,
          shipping_district: shipping_district || null,
          shipping_postal : shipping_postal || null,
          phone           : phone || null,
          tc_kimlik       : tc_kimlik || null,
          full_name       : full_name || null,
          payment_amount  : parseFloat(payment_amount) || 0,
          admin_notes     : admin_notes || 'Manuel oluşturuldu'
        })
        if (error) throw error
        return res.json({ success: true, slug })
      }

      case 'delete-kit': {
        const { orderId } = data
        if (!orderId) return res.status(400).json({ error: 'orderId gerekli' })
        const { error } = await sb.from('kits').delete().eq('id', orderId)
        if (error) throw error
        return res.json({ success: true })
      }

      case 'toggle-kit-active': {
        const { orderId, is_active } = data
        const { error } = await sb.from('kits').update({ is_active }).eq('id', orderId)
        if (error) throw error
        return res.json({ success: true })
      }

      case 'update-user': {
        const { user_id, first_name, last_name, phone } = data
        if (!user_id) return res.status(400).json({ error: 'user_id gerekli' })
        const upd = {}
        if (first_name !== undefined) upd.first_name = first_name
        if (last_name !== undefined)  upd.last_name  = last_name
        if (phone !== undefined)      upd.phone      = phone
        const { error } = await sb.from('profiles').upsert({ id: user_id, ...upd })
        if (error) throw error
        return res.json({ success: true })
      }

      case 'delete-user': {
        const { user_id } = data
        if (!user_id) return res.status(400).json({ error: 'user_id gerekli' })
        // Önce kit ve medical_data sil
        await sb.from('kits').delete().eq('user_id', user_id)
        await sb.from('medical_data').delete().eq('user_id', user_id)
        await sb.from('profiles').delete().eq('id', user_id)
        // Auth kullanıcısını da sil
        const { error: authErr } = await sb.auth.admin.deleteUser(user_id)
        if (authErr) console.warn('Auth silme hatası:', authErr.message)
        return res.json({ success: true })
      }

      case 'get-medical': {
        const { user_id } = data
        if (!user_id) return res.status(400).json({ error: 'user_id gerekli' })
        const { data: medical } = await sb.from('medical_data').select('*').eq('user_id', user_id).maybeSingle()
        return res.json({ medical })
      }

      case 'reset-password': {
        const { user_id, new_password } = data
        if (!user_id || !new_password) return res.status(400).json({ error: 'user_id ve new_password gerekli' })
        if (new_password.length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter' })
        const { error } = await sb.auth.admin.updateUserById(user_id, { password: new_password })
        if (error) throw error
        return res.json({ success: true })
      }

      case 'delete-pending': {
        const { token } = data
        if (!token) return res.status(400).json({ error: 'token gerekli' })
        const { error } = await sb.from('pending_payments').delete().eq('token', token)
        if (error) throw error
        return res.json({ success: true })
      }

      default:
        return res.status(400).json({ error: 'Bilinmeyen action: ' + action })
    }
  } catch (e) {
    console.error('Admin action hatası:', e)
    return res.status(500).json({ error: e.message })
  }
}

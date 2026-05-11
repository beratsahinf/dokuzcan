// api/admin-update-order.js
const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const pw = req.headers['x-admin-password']
  if (!pw || pw !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Yetkisiz' })
  }

  const { orderId, status, shipping_company, tracking_number, admin_notes } = req.body
  if (!orderId) return res.status(400).json({ error: 'orderId gerekli' })

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const updateData = {}
    if (status) updateData.status = status
    if (shipping_company !== undefined) updateData.shipping_company = shipping_company || null
    if (tracking_number !== undefined)  updateData.tracking_number  = tracking_number  || null
    if (admin_notes !== undefined)      updateData.admin_notes      = admin_notes      || null
    if (status === 'shipped' && tracking_number) updateData.shipped_at = new Date().toISOString()
    if (status === 'delivered') updateData.delivered_at = new Date().toISOString()

    const { error } = await sb.from('kits').update(updateData).eq('id', orderId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

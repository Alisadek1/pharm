import { useState, useEffect, useCallback } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, StarIcon } from '@heroicons/react/24/outline'

function toWaPhone(phone) {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return d.slice(1)
  return d
}
function openWhatsApp(phone, t) {
  const wa = toWaPhone(phone)
  if (!wa) return toast.error(t('customers.whatsapp_no_phone'))
  window.open(`https://wa.me/${wa}`, '_blank')
}
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime, formatDate } from '../../utils/format'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

function CustomerForm({ initial, onSubmit, loading }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(initial || { name: '', phone: '', email: '', date_of_birth: '', gender: '', address: '', id_number: '', notes: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) return toast.error(t('customers.required_name')); onSubmit(form) }} className="space-y-4">
      <div><label className="label">{t('customers.full_name')} *</label><input value={form.name} onChange={e => set('name', e.target.value)} className="input" required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('common.phone')}</label><input value={form.phone} onChange={e => set('phone', e.target.value)} className="input" /></div>
        <div><label className="label">{t('common.email')}</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('customers.dob')}</label><input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} className="input" /></div>
        <div>
          <label className="label">{t('customers.gender')}</label>
          <select value={form.gender} onChange={e => set('gender', e.target.value)} className="input">
            <option value="">{t('common.select')}</option>
            <option value="male">{t('customers.male')}</option>
            <option value="female">{t('customers.female')}</option>
            <option value="other">{t('customers.other')}</option>
          </select>
        </div>
      </div>
      <div><label className="label">{t('customers.id_number')}</label><input value={form.id_number} onChange={e => set('id_number', e.target.value)} className="input" /></div>
      <div><label className="label">{t('common.address')}</label><textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} className="input resize-none" /></div>
      <div><label className="label">{t('common.notes')}</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="input resize-none" /></div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? t('common.saving') : (initial ? t('customers.update') : t('customers.add'))}</button>
    </form>
  )
}

export default function CustomersPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, post, put, del, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem] = useState(null)
  const [viewItem, setViewItem] = useState(null)
  const [history, setHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    get('/api/customers', { page: pg.page, per_page: pg.perPage, search }).then(res => { setRows(res.data || []); pg.updateMeta(res.meta) })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  const openView = async (item) => {
    setViewItem(item); setModal('view')
    const res = await get(`/api/customers/${item.id}/history`, { per_page: 10 })
    setHistory(res.data || [])
  }

  const handleSave = async (form) => {
    setSaving(true)
    try {
      editItem ? await put(`/api/customers/${editItem.id}`, form) : await post('/api/customers', form)
      toast.success(editItem ? t('customers.updated') : t('customers.added'))
      setModal(null); setEditItem(null); load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await del(`/api/customers/${delItem.id}`); toast.success(t('customers.deactivated')); setDelItem(null); load() }
    catch {} finally { setDeleting(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('customers.title')}</h1>
          <p className="text-sm text-gray-500">{t('customers.count', { count: pg.total })}</p>
        </div>
        {can('customers.create') && <button onClick={() => { setEditItem(null); setModal('form') }} className="btn-primary"><PlusIcon className="w-4 h-4" /> {t('customers.add')}</button>}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} placeholder={t('common.search')} className="max-w-sm" />
        </div>

        {loading && !rows.length ? <TableSkeleton rows={5} cols={7} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('customers.col_name')}</th>
                  <th>{t('customers.col_phone')}</th>
                  <th>{t('customers.col_loyalty')}</th>
                  <th>{t('customers.col_total')}</th>
                  <th>{t('customers.col_invoices')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="text-gray-400">{(pg.page - 1) * pg.perPage + i + 1}</td>
                    <td>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                        {row.email && <p className="text-xs text-gray-400">{row.email}</p>}
                      </div>
                    </td>
                    <td>{row.phone || '—'}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <StarIcon className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-medium">{row.loyalty_points}</span>
                      </div>
                    </td>
                    <td className="font-medium">{formatCurrency(row.total_purchases)}</td>
                    <td><span className="badge badge-blue">{row.total_invoices}</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openView(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500"><EyeIcon className="w-4 h-4" /></button>
                        {row.phone && (
                          <button onClick={() => openWhatsApp(row.phone, t)} title={t('customers.whatsapp')} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-green-500">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          </button>
                        )}
                        {can('customers.edit') && <button onClick={() => { setEditItem(row); setModal('form') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600"><PencilIcon className="w-4 h-4" /></button>}
                        {can('customers.delete') && <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && <tr><td colSpan={7} className="text-center text-gray-400 py-12">{t('customers.no_customers')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'form'} onClose={() => { setModal(null); setEditItem(null) }} title={editItem ? t('customers.update') : t('customers.add')}>
        <CustomerForm initial={editItem} onSubmit={handleSave} loading={saving} />
      </Modal>

      <Modal open={modal === 'view'} onClose={() => setModal(null)} title={`${t('customers.title')}: ${viewItem?.name}`} size="lg">
        {viewItem && (
          <div className="space-y-4">
            {viewItem.phone && (
              <button onClick={() => openWhatsApp(viewItem.phone, t)} className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 border border-green-200 dark:border-green-800 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {t('customers.whatsapp')} ({viewItem.phone})
              </button>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {[
                [t('common.phone'), viewItem.phone],
                [t('common.email'), viewItem.email],
                [t('customers.gender'), viewItem.gender],
                [t('customers.dob'), formatDate(viewItem.date_of_birth)],
                [t('customers.col_loyalty'), viewItem.loyalty_points],
                [t('customers.col_total'), formatCurrency(viewItem.total_purchases)],
              ].map(([label, value]) => (
                <div key={label}><p className="text-gray-400 text-xs">{label}</p><p className="font-medium">{value || '—'}</p></div>
              ))}
            </div>
            <h4 className="font-semibold">{t('customers.purchase_history')}</h4>
            <div className="table-container">
              <table className="table">
                <thead><tr><th>{t('sales.col_invoice')}</th><th>{t('common.date')}</th><th>{t('common.total')}</th><th>{t('customers.points_earned')}</th></tr></thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td className="font-mono text-xs">{h.invoice_number}</td>
                      <td>{formatDateTime(h.sale_date)}</td>
                      <td className="font-medium">{formatCurrency(h.total)}</td>
                      <td><span className="badge badge-yellow">+{h.loyalty_points_earned}</span></td>
                    </tr>
                  ))}
                  {!history.length && <tr><td colSpan={4} className="text-center text-gray-400 py-4">{t('common.no_data')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!delItem} onClose={() => setDelItem(null)} onConfirm={handleDelete} loading={deleting}
        title={t('customers.deactivate_title')} message={t('customers.deactivate_confirm', { name: delItem?.name })} confirmLabel={t('customers.deactivate_btn')} />
    </div>
  )
}

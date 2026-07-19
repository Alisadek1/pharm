import { useState, useEffect, useCallback } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, TruckIcon, EyeIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime, statusLabel } from '../../utils/format'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

function SupplierForm({ initial, onSubmit, loading }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(initial || { name: '', company_name: '', phone: '', email: '', address: '', tax_number: '', credit_limit: 0, notes: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) return toast.error(t('suppliers.required_name')); onSubmit(form) }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('suppliers.contact_name')} *</label><input value={form.name} onChange={e => set('name', e.target.value)} className="input" required /></div>
        <div><label className="label">{t('suppliers.company_name')}</label><input value={form.company_name} onChange={e => set('company_name', e.target.value)} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('common.phone')}</label><input value={form.phone} onChange={e => set('phone', e.target.value)} className="input" /></div>
        <div><label className="label">{t('common.email')}</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('suppliers.tax_number')}</label><input value={form.tax_number} onChange={e => set('tax_number', e.target.value)} className="input" /></div>
        <div><label className="label">{t('suppliers.credit_limit')}</label><input type="number" min="0" value={form.credit_limit} onChange={e => set('credit_limit', e.target.value)} className="input" /></div>
      </div>
      <div><label className="label">{t('common.address')}</label><textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} className="input resize-none" /></div>
      <div><label className="label">{t('common.notes')}</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="input resize-none" /></div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? t('common.saving') : (initial ? t('suppliers.update') : t('suppliers.add'))}</button>
    </form>
  )
}

export default function SuppliersPage() {
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
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [purchases, setPurchases] = useState([])

  const load = useCallback(() => {
    get('/api/suppliers', { page: pg.page, per_page: pg.perPage, search }).then(res => { setRows(res.data || []); pg.updateMeta(res.meta) })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  const openView = async (item) => {
    setViewItem(item)
    setModal('view')
    const res = await get(`/api/suppliers/${item.id}/purchases`, { per_page: 10 })
    setPurchases(res.data || [])
  }

  const handleSave = async (form) => {
    setSaving(true)
    try {
      if (editItem) {
        await put(`/api/suppliers/${editItem.id}`, form)
        toast.success(t('suppliers.updated'))
      } else {
        await post('/api/suppliers', form)
        toast.success(t('suppliers.added'))
      }
      setModal(null); setEditItem(null); load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await del(`/api/suppliers/${delItem.id}`); toast.success(t('suppliers.deleted')); setDelItem(null); load() }
    catch {} finally { setDeleting(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('suppliers.title')}</h1>
          <p className="text-sm text-gray-500">{t('suppliers.count', { count: pg.total })}</p>
        </div>
        {can('suppliers.create') && <button onClick={() => { setEditItem(null); setModal('form') }} className="btn-primary"><PlusIcon className="w-4 h-4" /> {t('suppliers.add')}</button>}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} placeholder={t('common.search')} className="max-w-xs" />
        </div>

        {loading && !rows.length ? <TableSkeleton rows={5} cols={7} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('suppliers.col_name')}</th>
                  <th>{t('suppliers.col_phone')}</th>
                  <th>{t('suppliers.col_email')}</th>
                  <th>{t('suppliers.col_balance')}</th>
                  <th>{t('nav.purchases')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="text-gray-400">{(pg.page - 1) * pg.perPage + i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                          <TruckIcon className="w-4 h-4 text-amber-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                          {row.company_name && <p className="text-xs text-gray-400">{row.company_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td>{row.phone || '—'}</td>
                    <td>{row.email || '—'}</td>
                    <td className={row.balance > 0 ? 'text-red-500 font-medium' : 'text-gray-500'}>{formatCurrency(row.balance)}</td>
                    <td><span className="badge badge-blue">{row.total_purchases}</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openView(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500"><EyeIcon className="w-4 h-4" /></button>
                        {can('suppliers.edit') && <button onClick={() => { setEditItem(row); setModal('form') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600"><PencilIcon className="w-4 h-4" /></button>}
                        {can('suppliers.delete') && <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && <tr><td colSpan={7} className="text-center text-gray-400 py-12">{t('suppliers.no_suppliers')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'form'} onClose={() => { setModal(null); setEditItem(null) }} title={editItem ? t('suppliers.update') : t('suppliers.add')}>
        <SupplierForm initial={editItem} onSubmit={handleSave} loading={saving} />
      </Modal>

      <Modal open={modal === 'view'} onClose={() => setModal(null)} title={viewItem?.name} size="lg">
        {viewItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('common.phone')}:</span> <span className="font-medium">{viewItem.phone || '—'}</span></div>
              <div><span className="text-gray-500">{t('common.email')}:</span> <span className="font-medium">{viewItem.email || '—'}</span></div>
              <div><span className="text-gray-500">{t('suppliers.col_balance')}:</span> <span className={`font-medium ${viewItem.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>{formatCurrency(viewItem.balance)}</span></div>
              <div><span className="text-gray-500">{t('suppliers.credit_limit')}:</span> <span className="font-medium">{formatCurrency(viewItem.credit_limit)}</span></div>
            </div>
            <h4 className="font-semibold text-gray-900 dark:text-white">{t('suppliers.recent_purchases')}</h4>
            <div className="table-container">
              <table className="table">
                <thead><tr><th>{t('purchases.col_reference')}</th><th>{t('common.date')}</th><th>{t('common.total')}</th><th>{t('common.status')}</th></tr></thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs">{p.invoice_number}</td>
                      <td>{formatDateTime(p.purchase_date)}</td>
                      <td className="font-medium">{formatCurrency(p.total)}</td>
                      <td><span className={`badge badge-${statusLabel(p.payment_status).color}`}>{statusLabel(p.payment_status).label}</span></td>
                    </tr>
                  ))}
                  {!purchases.length && <tr><td colSpan={4} className="text-center text-gray-400 py-4">{t('common.no_data')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!delItem}
        onClose={() => setDelItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title={t('suppliers.delete_title')}
        message={t('suppliers.delete_confirm', { name: delItem?.name })}
      />
    </div>
  )
}

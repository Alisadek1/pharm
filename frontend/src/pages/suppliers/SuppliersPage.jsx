import { useState, useEffect, useCallback } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, TruckIcon, EyeIcon, CreditCardIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateTime, formatDate, statusLabel } from '../../utils/format'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

const PAYMENT_METHODS = ['cash', 'visa', 'bank_transfer', 'wallet']

function SupplierForm({ initial, onSubmit, loading }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(initial || {
    name: '', company_name: '', phone: '', email: '',
    address: '', tax_number: '', credit_limit: 0, notes: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error(t('suppliers.required_name'))
    if (!form.company_name.trim()) return toast.error(t('suppliers.company_required'))
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">{t('suppliers.contact_name')} *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">{t('suppliers.company_name')} *</label>
          <input value={form.company_name} onChange={e => set('company_name', e.target.value)} className="input" required />
        </div>
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
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? t('common.saving') : (initial ? t('suppliers.update') : t('suppliers.add'))}
      </button>
    </form>
  )
}

function PaymentForm({ supplierId, onSuccess, onClose }) {
  const { t } = useTranslation()
  const { post } = useApi()
  const [form, setForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error(t('suppliers.payment_amount_required'))
    setSaving(true)
    try {
      await post(`/api/suppliers/${supplierId}/payments`, form)
      toast.success(t('suppliers.payment_added'))
      onSuccess()
    } catch {} finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">{t('suppliers.payment_amount')} *</label>
          <input type="number" step="any" min="0.001" value={form.amount} onChange={e => set('amount', e.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">{t('suppliers.payment_date')} *</label>
          <input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} className="input" required />
        </div>
      </div>
      <div>
        <label className="label">{t('suppliers.payment_method')}</label>
        <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)} className="input">
          <option value="cash">{t('payment.cash')}</option>
          <option value="visa">{t('payment.visa')}</option>
          <option value="bank_transfer">{t('payment.bank_transfer')}</option>
          <option value="wallet">{t('payment.wallet')}</option>
        </select>
      </div>
      <div>
        <label className="label">{t('common.notes')}</label>
        <input value={form.notes} onChange={e => set('notes', e.target.value)} className="input" />
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">{t('common.cancel')}</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving ? t('common.saving') : t('suppliers.add_payment')}
        </button>
      </div>
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
  const [payments, setPayments] = useState([])
  const [viewTab, setViewTab] = useState('purchases')
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [deletingPayment, setDeletingPayment] = useState(null)

  const load = useCallback(() => {
    get('/api/suppliers', { page: pg.page, per_page: pg.perPage, search }).then(res => {
      setRows(res.data || [])
      pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  const loadPayments = async (id) => {
    const res = await get(`/api/suppliers/${id}/payments`, { per_page: 20 })
    setPayments(res.data || [])
  }

  const openView = async (item) => {
    setViewItem(item)
    setViewTab('purchases')
    setShowPaymentForm(false)
    setModal('view')
    const [pRes] = await Promise.all([
      get(`/api/suppliers/${item.id}/purchases`, { per_page: 10 }),
    ])
    setPurchases(pRes.data || [])
    loadPayments(item.id)
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
      setModal(null)
      setEditItem(null)
      load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await del(`/api/suppliers/${delItem.id}`)
      toast.success(t('suppliers.deleted'))
      setDelItem(null)
      load()
    } catch {} finally { setDeleting(false) }
  }

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm(t('common.confirm'))) return
    setDeletingPayment(paymentId)
    try {
      await del(`/api/suppliers/${viewItem.id}/payments/${paymentId}`)
      toast.success(t('suppliers.payment_deleted'))
      loadPayments(viewItem.id)
      // Refresh supplier balance in view
      const res = await get(`/api/suppliers/${viewItem.id}`)
      setViewItem(res.data)
      load()
    } catch {} finally { setDeletingPayment(null) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('suppliers.title')}</h1>
          <p className="text-sm text-gray-500">{t('suppliers.count', { count: pg.total })}</p>
        </div>
        {can('suppliers.create') && (
          <button onClick={() => { setEditItem(null); setModal('form') }} className="btn-primary">
            <PlusIcon className="w-4 h-4" /> {t('suppliers.add')}
          </button>
        )}
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
                        <button onClick={() => openView(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        {can('suppliers.edit') && (
                          <button onClick={() => { setEditItem(row); setModal('form') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600">
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        )}
                        {can('suppliers.delete') && (
                          <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-12">{t('suppliers.no_suppliers')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      {/* Add / Edit modal */}
      <Modal open={modal === 'form'} onClose={() => { setModal(null); setEditItem(null) }} title={editItem ? t('suppliers.update') : t('suppliers.add')}>
        <SupplierForm initial={editItem} onSubmit={handleSave} loading={saving} />
      </Modal>

      {/* View modal */}
      <Modal open={modal === 'view'} onClose={() => { setModal(null); setShowPaymentForm(false) }} title={viewItem?.name} size="lg">
        {viewItem && (
          <div className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('common.phone')}:</span> <span className="font-medium">{viewItem.phone || '—'}</span></div>
              <div><span className="text-gray-500">{t('common.email')}:</span> <span className="font-medium">{viewItem.email || '—'}</span></div>
              <div>
                <span className="text-gray-500">{t('suppliers.col_balance')}:</span>{' '}
                <span className={`font-semibold ${viewItem.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>{formatCurrency(viewItem.balance)}</span>
              </div>
              <div><span className="text-gray-500">{t('suppliers.credit_limit')}:</span> <span className="font-medium">{formatCurrency(viewItem.credit_limit)}</span></div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
              {[
                { key: 'purchases', label: t('suppliers.recent_purchases') },
                { key: 'payments', label: t('suppliers.payments_history') },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setViewTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${viewTab === tab.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Purchases tab */}
            {viewTab === 'purchases' && (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('purchases.col_reference')}</th>
                      <th>{t('common.date')}</th>
                      <th>{t('common.total')}</th>
                      <th>{t('common.status')}</th>
                    </tr>
                  </thead>
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
            )}

            {/* Payments tab */}
            {viewTab === 'payments' && (
              <div className="space-y-3">
                {can('suppliers.edit') && !showPaymentForm && (
                  <button onClick={() => setShowPaymentForm(true)} className="btn-secondary btn-sm w-full">
                    <CreditCardIcon className="w-4 h-4" /> {t('suppliers.add_payment')}
                  </button>
                )}

                {showPaymentForm && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-700/30">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900 dark:text-white">{t('suppliers.add_payment')}</h4>
                      <button onClick={() => setShowPaymentForm(false)} className="text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <PaymentForm
                      supplierId={viewItem.id}
                      onSuccess={() => {
                        setShowPaymentForm(false)
                        loadPayments(viewItem.id)
                        get(`/api/suppliers/${viewItem.id}`).then(r => setViewItem(r.data))
                        load()
                      }}
                      onClose={() => setShowPaymentForm(false)}
                    />
                  </div>
                )}

                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('suppliers.payment_date')}</th>
                        <th>{t('suppliers.payment_amount')}</th>
                        <th>{t('suppliers.payment_method')}</th>
                        <th>{t('common.notes')}</th>
                        {can('suppliers.edit') && <th>{t('common.actions')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td>{formatDate(p.payment_date)}</td>
                          <td className="font-semibold text-green-600">{formatCurrency(p.amount)}</td>
                          <td className="capitalize">{p.payment_method}</td>
                          <td className="text-gray-500 text-sm">{p.notes || '—'}</td>
                          {can('suppliers.edit') && (
                            <td>
                              <button
                                onClick={() => handleDeletePayment(p.id)}
                                disabled={deletingPayment === p.id}
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {!payments.length && (
                        <tr><td colSpan={5} className="text-center text-gray-400 py-4">{t('suppliers.no_payments')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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

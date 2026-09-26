import { useState, useEffect, useCallback } from 'react'
import {
  PlusIcon, EyeIcon, TrashIcon, CheckIcon, XMarkIcon,
  ArrowUturnLeftIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useApi } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  submitted: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  approved:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  rejected:  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  applied:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

const REASON_CODES = ['damage', 'theft', 'expiry', 'correction', 'stocktake', 'donation', 'other']
const ADJUST_TYPES = ['add', 'remove', 'correction']

function MedicineSearch({ api, onSelect }) {
  const { t }           = useTranslation()
  const [q, setQ]       = useState('')
  const [results, setR] = useState([])
  const [loading, setL] = useState(false)

  const search = useCallback(async (val) => {
    if (val.length < 2) { setR([]); return }
    setL(true)
    try {
      const r = await api.get(`/api/inventory/counts/search-medicines?q=${encodeURIComponent(val)}`)
      setR(r.data ?? [])
    } catch { setR([]) }
    finally { setL(false) }
  }, [api])

  useEffect(() => {
    const t2 = setTimeout(() => search(q), 300)
    return () => clearTimeout(t2)
  }, [q, search])

  return (
    <div className="space-y-2">
      <input value={q} onChange={e => setQ(e.target.value)}
        placeholder={t('adjustment.search_medicine')}
        className="input text-sm" />
      {loading && <p className="text-xs text-gray-400">…</p>}
      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700">
          {results.map(r => (
            <div key={r.batch_id}
              className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
              onClick={() => { onSelect(r); setQ(''); setR([]) }}>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.medicine_name}</p>
                <p className="text-xs text-gray-400 font-mono">{r.batch_number} · exp {r.expiry_date} · stock {r.current_qty}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdjustmentPage() {
  const { t }              = useTranslation()
  const { can }            = useAuth()
  const api                = useApi()
  const { get, post }      = api

  const [requests, setRequests]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [total, setTotal]           = useState(0)
  const [statusFilter, setStatus]   = useState('')
  const perPage                     = 20

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [form, setForm]             = useState({ reason_code: 'correction', reason_text: '', notes: '' })

  const [detail, setDetail]         = useState(null)
  const [detailLoading, setDL]      = useState(false)
  const [transitioning, setTrans]   = useState(false)

  // Add-item state within detail
  const [addItem, setAddItem]       = useState(null)  // { medicine_id, batch_id, medicine_name, batch_number, current_qty }
  const [addForm, setAddForm]       = useState({ adjust_type: 'add', quantity: '', reason_note: '' })
  const [addingSave, setAS]         = useState(false)

  const [rejectModal, setRejectMod] = useState(false)
  const [rejectReason, setRejectR]  = useState('')

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const r = await get(`/api/inventory/adjustments?page=${page}&per_page=${perPage}${statusFilter ? `&status=${statusFilter}` : ''}`)
      setRequests(r.data ?? [])
      setTotal(r.meta?.total ?? 0)
    } catch {
      toast.error(t('common.load_failed'))
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, t])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const openDetail = async (id) => {
    setDL(true)
    try {
      const r = await get(`/api/inventory/adjustments/${id}`)
      setDetail(r.data ?? null)
      setAddItem(null)
    } catch {
      toast.error(t('common.load_failed'))
    } finally {
      setDL(false)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      const r = await post('/api/inventory/adjustments', fd)
      toast.success(r.message ?? t('common.saved'))
      setShowCreate(false)
      setForm({ reason_code: 'correction', reason_text: '', notes: '' })
      fetchRequests()
      openDetail(r.data?.id)
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('common.save_failed'))
    } finally {
      setCreating(false)
    }
  }

  const doTransition = async (endpoint, body, successMsg) => {
    if (!detail) return
    setTrans(true)
    try {
      const fd = new FormData()
      if (body) Object.entries(body).forEach(([k, v]) => fd.append(k, v))
      await post(`/api/inventory/adjustments/${detail.id}/${endpoint}`, fd)
      toast.success(successMsg)
      openDetail(detail.id)
      fetchRequests()
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('common.save_failed'))
    } finally {
      setTrans(false)
    }
  }

  const handleSubmit  = () => doTransition('submit', null, t('adjustment.submitted_ok'))
  const handleApprove = () => doTransition('approve', null, t('adjustment.approved_ok'))
  const handleApply   = () => {
    if (!window.confirm(t('adjustment.confirm_apply'))) return
    doTransition('apply', null, t('adjustment.applied_ok'))
  }
  const handleReject  = async () => {
    await doTransition('reject', { rejection_reason: rejectReason }, t('adjustment.rejected_ok'))
    setRejectMod(false)
    setRejectR('')
  }
  const handleReverse = () => {
    if (!window.confirm(t('adjustment.confirm_reverse'))) return
    doTransition('reverse', null, t('adjustment.reversed_ok'))
  }

  const handleSelectMedicine = (row) => {
    setAddItem({ medicine_id: row.medicine_id, batch_id: row.batch_id, medicine_name: row.medicine_name, batch_number: row.batch_number, current_qty: row.current_qty })
    setAddForm({ adjust_type: 'add', quantity: '', reason_note: '' })
  }

  const handleSaveItem = async () => {
    if (!addItem || !addForm.quantity) { toast.error(t('adjustment.quantity_required')); return }
    setAS(true)
    try {
      const fd = new FormData()
      fd.append('medicine_id', addItem.medicine_id)
      fd.append('batch_id', addItem.batch_id)
      fd.append('adjust_type', addForm.adjust_type)
      fd.append('quantity', addForm.quantity)
      fd.append('reason_note', addForm.reason_note)
      await post(`/api/inventory/adjustments/${detail.id}/items`, fd)
      toast.success(t('adjustment.item_added'))
      setAddItem(null)
      openDetail(detail.id)
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('common.save_failed'))
    } finally {
      setAS(false)
    }
  }

  const handleRemoveItem = async (itemId) => {
    if (!window.confirm(t('adjustment.confirm_remove_item'))) return
    try {
      await api.del(`/api/inventory/adjustments/${detail.id}/items/${itemId}`)
      toast.success(t('adjustment.item_removed'))
      openDetail(detail.id)
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('common.save_failed'))
    }
  }

  const canCreate  = can('inventory.adjustment')
  const canApprove = can('inventory.adjustment.approve')
  const isDraft    = detail?.status === 'draft'
  const isEditable = isDraft

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('adjustment.title')}</h1>
        <div className="flex gap-3">
          <select value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="input text-sm h-10 w-auto">
            <option value="">{t('adjustment.all_statuses')}</option>
            {['draft','submitted','approved','rejected','applied'].map(s => (
              <option key={s} value={s}>{t(`adjustment.status_${s}`)}</option>
            ))}
          </select>
          {canCreate && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors text-sm font-medium">
              <PlusIcon className="w-4 h-4" />{t('adjustment.new')}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : requests.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ArrowUturnLeftIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('adjustment.no_requests')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                {[
                  t('adjustment.col_number'), t('adjustment.col_reason'),
                  t('adjustment.col_status'), t('adjustment.col_items'),
                  t('adjustment.col_created'), t('adjustment.col_actions'),
                ].map((h, i) => (
                  <th key={i} className="text-start px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700 dark:text-gray-300">{r.request_number}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{t(`adjustment.reason_${r.reason_code}`)}</span>
                    {r.reason_text && <p className="text-xs text-gray-400 truncate max-w-[160px]">{r.reason_text}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? ''}`}>
                      {t(`adjustment.status_${r.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 tabular-nums">{r.item_count}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openDetail(r.id)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                      <EyeIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > perPage && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <Pagination page={page} totalPages={Math.ceil(total / perPage)} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* ── Create modal ───────────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('adjustment.new')} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">{t('adjustment.reason_code_label')}</label>
            <select value={form.reason_code} onChange={e => setForm(f => ({ ...f, reason_code: e.target.value }))} className="input">
              {REASON_CODES.map(c => <option key={c} value={c}>{t(`adjustment.reason_${c}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('adjustment.reason_text_label')}</label>
            <input value={form.reason_text} onChange={e => setForm(f => ({ ...f, reason_text: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">{t('adjustment.notes_label')}</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="input resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="flex-1 btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleCreate} disabled={creating} className="flex-1 btn-primary">
              {creating ? '…' : t('common.create')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Detail modal ───────────────────────────────────────────────────── */}
      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title={detail.request_number} size="xl">
          <div className="space-y-4">

            {/* Meta + actions */}
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[detail.status] ?? ''}`}>
                    {t(`adjustment.status_${detail.status}`)}
                  </span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    {t(`adjustment.reason_${detail.reason_code}`)}
                  </span>
                  {detail.reason_text && <span className="text-xs text-gray-400">— {detail.reason_text}</span>}
                </div>
                {detail.rejection_reason && (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                    {t('adjustment.rejected_reason')}: {detail.rejection_reason}
                  </div>
                )}
                {detail.notes && <p className="text-xs text-gray-500 italic">{detail.notes}</p>}
              </div>

              <div className="flex gap-2 flex-wrap">
                {canCreate && isDraft && !transitioning && (
                  <button onClick={handleSubmit} className="btn-secondary text-sm flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4" />{t('adjustment.submit')}
                  </button>
                )}
                {canApprove && detail.status === 'submitted' && !transitioning && (<>
                  <button onClick={handleApprove} className="btn-secondary text-sm flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4" />{t('adjustment.approve')}
                  </button>
                  <button onClick={() => setRejectMod(true)} className="btn-danger text-sm flex items-center gap-1.5">
                    <XMarkIcon className="w-4 h-4" />{t('adjustment.reject')}
                  </button>
                </>)}
                {canApprove && detail.status === 'approved' && !transitioning && (
                  <button onClick={handleApply} className="btn-primary text-sm flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4" />{t('adjustment.apply')}
                  </button>
                )}
                {canApprove && detail.status === 'applied' && !transitioning && (
                  <button onClick={handleReverse} className="btn-danger text-sm flex items-center gap-1.5">
                    <ArrowUturnLeftIcon className="w-4 h-4" />{t('adjustment.reverse')}
                  </button>
                )}
              </div>
            </div>

            {/* Add item panel (draft only) */}
            {isEditable && canCreate && (
              <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/10 p-3 space-y-3">
                <p className="text-xs font-semibold text-primary-700 dark:text-primary-400">{t('adjustment.add_item')}</p>
                <MedicineSearch api={api} onSelect={handleSelectMedicine} />
                {addItem && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{addItem.medicine_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{addItem.batch_number} · stock {addItem.current_qty}</p>
                      </div>
                      <button onClick={() => setAddItem(null)} className="text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="label text-xs">{t('adjustment.adjust_type')}</label>
                        <select value={addForm.adjust_type} onChange={e => setAddForm(f => ({ ...f, adjust_type: e.target.value }))} className="input text-sm">
                          {ADJUST_TYPES.map(t2 => <option key={t2} value={t2}>{t(`adjustment.type_${t2}`)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label text-xs">{t('adjustment.quantity')}</label>
                        <input type="number" min="1" value={addForm.quantity}
                          onChange={e => setAddForm(f => ({ ...f, quantity: e.target.value }))}
                          className="input text-sm tabular-nums" />
                      </div>
                      <div>
                        <label className="label text-xs">{t('adjustment.item_reason')}</label>
                        <input value={addForm.reason_note}
                          onChange={e => setAddForm(f => ({ ...f, reason_note: e.target.value }))}
                          className="input text-sm" />
                      </div>
                    </div>
                    <button onClick={handleSaveItem} disabled={addingSave}
                      className="w-full btn-primary text-sm">
                      {addingSave ? '…' : t('common.add')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Items table */}
            <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    {[
                      t('adjustment.col_medicine'), t('adjustment.col_batch'),
                      t('adjustment.col_type'), t('adjustment.col_quantity'),
                      t('adjustment.col_item_reason'), '',
                    ].map((h, i) => (
                      <th key={i} className="text-start px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {(detail.items ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                        {t('adjustment.no_items')}
                      </td>
                    </tr>
                  ) : (detail.items ?? []).map(item => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-800 dark:text-gray-200">{item.medicine_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                        {item.batch_number ?? '—'}
                        {item.expiry_date && <span className="block text-gray-400">{item.expiry_date}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          item.adjust_type === 'add' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                          item.adjust_type === 'remove' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}>
                          {t(`adjustment.type_${item.adjust_type}`)}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300 font-medium">{item.quantity}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{item.reason_note ?? '—'}</td>
                      <td className="px-3 py-2">
                        {isEditable && canCreate && (
                          <button onClick={() => handleRemoveItem(item.id)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Applied adjustments (after apply) */}
            {detail.status === 'applied' && detail.applied_adjustments?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {t('adjustment.applied_adjustments')}
                </p>
                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700/50">
                        {[t('adjustment.col_reference'), t('adjustment.col_medicine'),
                          t('adjustment.col_batch'), t('adjustment.col_before'),
                          t('adjustment.col_change'), t('adjustment.col_after'),
                          t('adjustment.col_reversed')].map((h, i) => (
                          <th key={i} className="text-start px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {detail.applied_adjustments.map(a => (
                        <tr key={a.reference_number}
                          className={a.reversed_at ? 'opacity-50' : ''}>
                          <td className="px-3 py-1.5 font-mono text-gray-600 dark:text-gray-300">{a.reference_number}</td>
                          <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">{a.medicine_name}</td>
                          <td className="px-3 py-1.5 font-mono text-gray-500">{a.batch_number ?? '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums">{a.quantity_before}</td>
                          <td className={`px-3 py-1.5 tabular-nums font-medium ${a.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {a.quantity_change > 0 ? '+' : ''}{a.quantity_change}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums">{a.quantity_after}</td>
                          <td className="px-3 py-1.5 text-gray-400">
                            {a.reversed_at ? new Date(a.reversed_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Reject modal ───────────────────────────────────────────────────── */}
      <Modal open={rejectModal} onClose={() => setRejectMod(false)} title={t('adjustment.reject')} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">{t('adjustment.rejection_reason_label')}</label>
            <textarea value={rejectReason} onChange={e => setRejectR(e.target.value)} rows={3} className="input resize-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setRejectMod(false)} className="flex-1 btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleReject} disabled={transitioning} className="flex-1 btn-danger">
              {transitioning ? '…' : t('adjustment.reject')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  PlusIcon, EyeIcon, TrashIcon, CheckIcon,
  ClipboardDocumentCheckIcon, ExclamationTriangleIcon, MagnifyingGlassIcon,
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
  counting:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  submitted: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  approved:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  applied:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  closed:    'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-400',
}

function ProgressBar({ counted, total }) {
  const pct = total > 0 ? Math.round((counted / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
        <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {counted}/{total}
      </span>
    </div>
  )
}

export default function InventoryCountPage() {
  const { t, i18n }        = useTranslation()
  const { can }            = useAuth()
  const { get, post, del } = useApi()
  const isAr               = i18n.language === 'ar'

  const [counts, setCounts]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [total, setTotal]           = useState(0)
  const perPage                     = 20

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [newNotes, setNewNotes]     = useState('')
  const [populateAll, setPopulate]  = useState(true)

  const [detail, setDetail]           = useState(null)
  const [detailLoading, setDL]        = useState(false)
  const [savingItem, setSavingItem]   = useState(null)
  const [transitioning, setTrans]     = useState(false)
  const [itemFilter, setItemFilter]   = useState('')

  // Add-item panel (for populate_all=0 counts)
  const [showAddItem, setShowAddItem]     = useState(false)
  const [addSearch, setAddSearch]         = useState('')
  const [addResults, setAddResults]       = useState([])
  const [addSearching, setAddSearching]   = useState(false)
  const searchTimerRef                    = useRef(null)

  const fetchCounts = useCallback(async () => {
    setLoading(true)
    try {
      const r = await get(`/api/inventory/counts?page=${page}&per_page=${perPage}`)
      setCounts(r.data ?? [])
      setTotal(r.meta?.total ?? 0)
    } catch {
      toast.error(t('common.load_failed'))
    } finally {
      setLoading(false)
    }
  }, [page, t])

  useEffect(() => { fetchCounts() }, [fetchCounts])

  const openDetail = async (id) => {
    setDL(true)
    setItemFilter('')
    try {
      const r = await get(`/api/inventory/counts/${id}`)
      setDetail(r.data ?? null)
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
      fd.append('notes', newNotes)
      fd.append('populate_all', populateAll ? '1' : '0')
      const r = await post('/api/inventory/counts', fd)
      toast.success(r.message ?? t('common.saved'))
      setShowCreate(false)
      setNewNotes('')
      fetchCounts()
      openDetail(r.data?.id)
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('common.save_failed'))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm(t('inventory.stocktake.confirm_delete'))) return
    try {
      await del(`/api/inventory/counts/${id}`)
      toast.success(t('inventory.stocktake.deleted_ok'))
      fetchCounts()
      if (detail?.id === id) setDetail(null)
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('common.save_failed'))
    }
  }

  const transition = async (endpoint, successMsg) => {
    if (!detail) return
    setTrans(true)
    try {
      const r = await post(`/api/inventory/counts/${detail.id}/${endpoint}`, new FormData())
      toast.success(successMsg)
      // If apply returned movement warnings, show them
      const warnings = r.data?.movement_warnings ?? []
      if (warnings.length > 0) {
        toast(t('inventory.stocktake.movement_warnings', { n: warnings.length }), { icon: '⚠️', duration: 6000 })
      }
      openDetail(detail.id)
      fetchCounts()
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('common.save_failed'))
    } finally {
      setTrans(false)
    }
  }

  const handleSubmit  = () => transition('submit', t('inventory.stocktake.submitted_ok'))
  const handleApprove = () => transition('approve', t('inventory.stocktake.approved_ok'))
  const handleApply   = async () => {
    if (!window.confirm(t('inventory.stocktake.confirm_apply'))) return
    await transition('apply', t('inventory.stocktake.applied_ok'))
  }

  const handleCounted = async (item, val) => {
    setSavingItem(item.id)
    try {
      const fd = new FormData()
      fd.append('medicine_id', item.medicine_id)
      if (item.batch_id) fd.append('batch_id', item.batch_id)
      fd.append('counted_qty', val === '' ? '' : String(parseInt(val) || 0))
      fd.append('expected_qty', item.expected_qty)
      await post(`/api/inventory/counts/${detail.id}/items`, fd)
      setDetail(d => ({
        ...d,
        items: d.items.map(i => i.id === item.id
          ? {
              ...i,
              counted_qty: val === '' ? null : parseInt(val),
              difference:  val === '' ? null : parseInt(val) - i.expected_qty,
            }
          : i),
      }))
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('common.save_failed'))
    } finally {
      setSavingItem(null)
    }
  }

  // Debounced search for add-item panel
  const handleAddSearch = (q) => {
    setAddSearch(q)
    clearTimeout(searchTimerRef.current)
    if (q.length < 2) { setAddResults([]); return }
    setAddSearching(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const r = await get(`/api/inventory/counts/search-medicines?q=${encodeURIComponent(q)}`)
        setAddResults(r.data ?? [])
      } catch {
        setAddResults([])
      } finally {
        setAddSearching(false)
      }
    }, 300)
  }

  const handleAddBatch = async (batchRow) => {
    if (!detail) return
    try {
      const fd = new FormData()
      fd.append('medicine_id', batchRow.medicine_id)
      fd.append('batch_id', batchRow.batch_id)
      fd.append('expected_qty', batchRow.current_qty)
      await post(`/api/inventory/counts/${detail.id}/items`, fd)
      toast.success(t('inventory.stocktake.item_added'))
      // Reload detail to show new item
      await openDetail(detail.id)
      setAddResults(r => r.filter(r2 => r2.batch_id !== batchRow.batch_id))
    } catch (e) {
      toast.error(e.response?.data?.message ?? t('common.save_failed'))
    }
  }

  const canEdit    = can('inventory.count')
  const canApprove = can('inventory.count.approve')
  const isEditable = detail && ['draft', 'counting'].includes(detail.status)

  // Filtered item list
  const filteredItems = (detail?.items ?? []).filter(item => {
    if (!itemFilter) return true
    const q = itemFilter.toLowerCase()
    return (
      item.medicine_name?.toLowerCase().includes(q) ||
      item.medicine_name_ar?.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q) ||
      item.batch_number?.toLowerCase().includes(q)
    )
  })

  const totalItems   = detail?.items?.length ?? 0
  const countedItems = detail?.items?.filter(i => i.counted_qty != null).length ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('inventory.stocktake.title')}
        </h1>
        {canEdit && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors text-sm font-medium">
            <PlusIcon className="w-4 h-4" />
            {t('inventory.stocktake.new_count')}
          </button>
        )}
      </div>

      {/* Counts table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : counts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('inventory.stocktake.no_counts')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                {[
                  t('inventory.stocktake.col_count'),
                  t('inventory.stocktake.col_status'),
                  t('inventory.stocktake.col_progress'),
                  t('inventory.stocktake.col_created'),
                  t('inventory.stocktake.col_actions'),
                ].map((h, i) => (
                  <th key={i} className="text-start px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {counts.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700 dark:text-gray-300">{c.count_number}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? ''}`}>
                      {t(`inventory.stocktake.status_${c.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 min-w-[140px]">
                    <ProgressBar counted={c.counted_items ?? 0} total={c.total_items ?? 0} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openDetail(c.id)}
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      {canEdit && c.status === 'draft' && (
                        <button onClick={() => handleDelete(c.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
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
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('inventory.stocktake.new_count')} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">{t('inventory.stocktake.notes_label')}</label>
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={3}
              className="input resize-none" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={populateAll} onChange={e => setPopulate(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('inventory.stocktake.populate_all')}</span>
          </label>
          {!populateAll && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('inventory.stocktake.populate_manual_hint')}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="flex-1 btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleCreate} disabled={creating} className="flex-1 btn-primary">
              {creating ? '…' : t('inventory.stocktake.new_count')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Detail modal ───────────────────────────────────────────────────── */}
      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title={detail.count_number} size="xl">
          <div className="space-y-4">

            {/* Status row + actions */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[detail.status] ?? ''}`}>
                  {t(`inventory.stocktake.status_${detail.status}`)}
                </span>
                {detail.snapshot_at && (
                  <span className="text-xs text-gray-400">
                    {t('inventory.stocktake.snapshot_at')}:&nbsp;
                    {new Date(detail.snapshot_at).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {isEditable && canEdit && (
                  <button onClick={() => setShowAddItem(s => !s)}
                    className="btn-secondary text-sm flex items-center gap-1.5">
                    <PlusIcon className="w-4 h-4" />
                    {t('inventory.stocktake.add_item')}
                  </button>
                )}
                {canEdit && detail.status === 'draft' && !transitioning && (
                  <button onClick={handleSubmit} className="btn-secondary text-sm flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4" />{t('inventory.stocktake.submit')}
                  </button>
                )}
                {canApprove && detail.status === 'submitted' && !transitioning && (
                  <button onClick={handleApprove} className="btn-secondary text-sm flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4" />{t('inventory.stocktake.approve')}
                  </button>
                )}
                {canApprove && detail.status === 'approved' && !transitioning && (
                  <button onClick={handleApply} className="btn-primary text-sm flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4" />{t('inventory.stocktake.apply')}
                  </button>
                )}
                {canEdit && detail.status === 'draft' && (
                  <button onClick={() => handleDelete(detail.id)}
                    className="btn-danger text-sm flex items-center gap-1.5">
                    <TrashIcon className="w-4 h-4" />{t('inventory.stocktake.delete')}
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {totalItems > 0 && (
              <ProgressBar counted={countedItems} total={totalItems} />
            )}

            {/* Add-item search panel */}
            {showAddItem && isEditable && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {t('inventory.stocktake.search_to_add')}
                </p>
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={addSearch}
                    onChange={e => handleAddSearch(e.target.value)}
                    placeholder={t('inventory.stocktake.search_placeholder')}
                    className="input pl-9 text-sm"
                  />
                </div>
                {addSearching && <p className="text-xs text-gray-400">…</p>}
                {addResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                    {addResults.map(r => (
                      <div key={r.batch_id}
                        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.medicine_name}</p>
                          <p className="text-xs text-gray-400 font-mono">
                            {r.batch_number} · exp {r.expiry_date} · stock {r.current_qty}
                          </p>
                        </div>
                        <button onClick={() => handleAddBatch(r)}
                          className="ml-3 px-2 py-1 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                          {t('common.add')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Item filter */}
            {totalItems > 5 && (
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  value={itemFilter}
                  onChange={e => setItemFilter(e.target.value)}
                  placeholder={t('inventory.stocktake.filter_items')}
                  className="input pl-9 text-sm"
                />
              </div>
            )}

            {/* Items table */}
            <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    {[
                      t('inventory.stocktake.col_medicine'),
                      t('inventory.stocktake.col_batch'),
                      t('inventory.stocktake.col_unit'),
                      t('inventory.stocktake.col_expected'),
                      t('inventory.stocktake.col_current_stock'),
                      t('inventory.stocktake.col_counted_qty'),
                      t('inventory.stocktake.col_diff'),
                    ].map((h, i) => (
                      <th key={i} className="text-start px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                        {itemFilter ? t('common.no_results') : t('inventory.stocktake.no_items')}
                      </td>
                    </tr>
                  ) : filteredItems.map(item => {
                    const diff         = item.counted_qty != null ? item.counted_qty - item.expected_qty : null
                    const stockChanged = item.current_batch_qty !== item.expected_qty && detail.status !== 'applied'
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800 dark:text-gray-200">{isAr && item.medicine_name_ar ? item.medicine_name_ar : item.medicine_name}</p>
                          <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap">
                          {item.batch_number ?? '—'}
                          {item.expiry_date && <span className="block text-gray-400">{item.expiry_date}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {item.default_unit_name ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {item.expected_qty}
                        </td>
                        <td className="px-3 py-2 text-end whitespace-nowrap">
                          <span className={`tabular-nums text-xs ${stockChanged ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-500'}`}>
                            {item.current_batch_qty}
                            {stockChanged && (
                              <ExclamationTriangleIcon className="inline w-3.5 h-3.5 ms-1 -mt-0.5" title={t('inventory.stocktake.stock_changed')} />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-end">
                          {isEditable ? (
                            <input
                              type="number" min="0"
                              defaultValue={item.counted_qty ?? ''}
                              onBlur={e => handleCounted(item, e.target.value)}
                              disabled={savingItem === item.id}
                              className="w-20 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-end bg-white dark:bg-gray-700 text-gray-900 dark:text-white tabular-nums focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none disabled:opacity-50"
                            />
                          ) : (
                            <span className="tabular-nums text-gray-600 dark:text-gray-300">
                              {item.counted_qty ?? '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums whitespace-nowrap">
                          {diff === null ? '—' : diff === 0 ? (
                            <span className="text-green-600 text-xs font-medium">{t('inventory.stocktake.diff_ok')}</span>
                          ) : diff > 0 ? (
                            <span className="text-blue-600 text-xs font-medium">+{diff}</span>
                          ) : (
                            <span className="text-red-600 text-xs font-medium">{diff}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {detail.notes && (
              <p className="text-sm text-gray-500 italic">{detail.notes}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

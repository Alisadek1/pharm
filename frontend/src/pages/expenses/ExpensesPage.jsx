import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon,
  BanknotesIcon, ChartPieIcon, TagIcon,
} from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { formatCurrency, formatDate } from '../../utils/format'
import toast from 'react-hot-toast'

const PAYMENT_METHODS = ['cash', 'visa', 'bank_transfer']

function ExpenseForm({ categories, initial, onSave, onClose }) {
  const { t } = useTranslation()
  const { post, put, loading } = useApi()
  const [form, setForm] = useState({
    category_id:    initial?.category_id    ?? '',
    amount:         initial?.amount         ?? '',
    expense_date:   initial?.expense_date   ?? new Date().toISOString().slice(0, 10),
    payment_method: initial?.payment_method ?? 'cash',
    notes:          initial?.notes          ?? '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v))
    const res = initial?.id
      ? await put(`/api/expenses/${initial.id}`, fd)
      : await post('/api/expenses', fd)
    if (res?.ok !== false) {
      toast.success(initial?.id ? t('expenses.updated') : t('expenses.created'))
      onSave()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('expenses.category')} *</label>
          <select value={form.category_id} onChange={e => set('category_id', e.target.value)} required
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500">
            <option value="">{t('expenses.select_category')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('expenses.amount')} *</label>
          <input type="number" step="0.001" min="0.001" value={form.amount} onChange={e => set('amount', e.target.value)} required
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.date')} *</label>
          <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} required
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('expenses.payment_method')}</label>
          <div className="flex gap-2 flex-wrap">
            {PAYMENT_METHODS.map(m => (
              <button key={m} type="button" onClick={() => set('payment_method', m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.payment_method === m
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}>
                {t(`expenses.methods.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.notes')}</label>
          <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={t('common.optional')}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 resize-none" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{t('common.cancel')}</button>
        <button type="submit" disabled={loading}
          className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
          {loading ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  )
}

function CategoryModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { get, post, put, del, loading } = useApi()
  const [cats, setCats]       = useState([])
  const [form, setForm]       = useState({ name: '', name_ar: '', editing: null })
  const [confirmDel, setConfirmDel] = useState(null) // cat to delete
  const [deleting, setDeleting]     = useState(false)

  const loadCats = useCallback(() => {
    get('/api/expense-categories').then(r => setCats(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => { loadCats() }, [loadCats])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const fd = new FormData()
    fd.append('name', form.name)
    fd.append('name_ar', form.name_ar)
    const res = form.editing
      ? await put(`/api/expense-categories/${form.editing}`, fd)
      : await post('/api/expense-categories', fd)
    if (res?.ok !== false) {
      setForm({ name: '', name_ar: '', editing: null })
      loadCats()
      onSaved()
    }
  }

  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    const res = await del(`/api/expense-categories/${confirmDel.id}`, { silent: true })
      .catch(err => ({ ok: false, _err: err }))
    setDeleting(false)
    if (res?.ok !== false && !res?._err) {
      toast.success(t('expenses.category_deleted'))
      setConfirmDel(null)
      loadCats()
      onSaved()
    }
  }

  const startEdit = (c) => {
    setConfirmDel(null)
    setForm({ name: c.name, name_ar: c.name_ar || '', editing: c.id })
  }

  const cancelEdit = () => setForm({ name: '', name_ar: '', editing: null })

  return (
    <div className="space-y-4">
      {/* Add / edit form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex gap-2">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('expenses.category_name_en')} required
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500" />
          <input value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
            placeholder={t('expenses.category_name_ar')}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-right" />
        </div>
        <div className="flex justify-end gap-2">
          {form.editing && (
            <button type="button" onClick={cancelEdit}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              {t('common.cancel')}
            </button>
          )}
          <button type="submit" disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {form.editing ? <><CheckIcon className="w-3.5 h-3.5" />{t('common.save')}</> : <><PlusIcon className="w-3.5 h-3.5" />{t('common.add')}</>}
          </button>
        </div>
      </form>

      <div className="border-t border-gray-100 dark:border-gray-700" />

      {/* Category list */}
      <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
        {cats.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">{t('common.no_data')}</p>
        )}
        {cats.map(c => (
          <div key={c.id}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
              form.editing === c.id
                ? 'border-primary-300 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-700'
                : confirmDel?.id === c.id
                ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700'
                : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
              {c.name_ar && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.name_ar}</p>}
            </div>

            {/* Inline delete confirmation */}
            {confirmDel?.id === c.id ? (
              <div className="flex items-center gap-1 ms-2 shrink-0">
                <span className="text-xs text-red-600 dark:text-red-400 me-1">{t('common.confirm')}?</span>
                <button onClick={handleDelete} disabled={deleting}
                  className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  <CheckIcon className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDel(null)} disabled={deleting}
                  className="p-1.5 border border-gray-300 dark:border-gray-600 text-gray-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 ms-2 shrink-0">
                <button onClick={() => startEdit(c)} title={t('common.edit')}
                  className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button onClick={() => { cancelEdit(); setConfirmDel(c) }} title={t('common.delete')}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end border-t border-gray-100 dark:border-gray-700 pt-3">
        <button onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}

export default function ExpensesPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, del, loading } = useApi()
  const pg = usePagination()

  const [rows, setRows]           = useState([])
  const [categories, setCategories] = useState([])
  const [summary, setSummary]     = useState(null)

  const [search, setSearch]       = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const [dateFrom, setDateFrom]   = useState(new Date().toISOString().slice(0, 8) + '01')
  const [dateTo, setDateTo]       = useState(new Date().toISOString().slice(0, 10))

  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [showCats, setShowCats]   = useState(false)
  const [delTarget, setDelTarget] = useState(null)

  const loadCategories = useCallback(() => {
    get('/api/expense-categories').then(r => setCategories(r.data || [])).catch(() => {})
  }, []) // get stable via memoized request

  const load = useCallback(() => {
    const params = new URLSearchParams({
      page: pg.page, per_page: pg.perPage, search,
      category_id: filterCat, payment_method: filterMethod,
      date_from: dateFrom, date_to: dateTo,
    })
    get(`/api/expenses?${params}`).then(r => {
      setRows(r.data || [])
      pg.updateMeta(r.meta)
    }).catch(() => {})
  }, [pg.page, pg.perPage, search, filterCat, filterMethod, dateFrom, dateTo]) // get omitted — stable

  const loadSummary = useCallback(() => {
    get(`/api/expenses/summary?date_from=${dateFrom}&date_to=${dateTo}`)
      .then(r => setSummary(r.data))
      .catch(() => {})
  }, [dateFrom, dateTo]) // get omitted — stable

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { load(); loadSummary() }, [load, loadSummary])

  const handleDelete = async () => {
    await del(`/api/expenses/${delTarget.id}`)
    toast.success(t('expenses.deleted'))
    setDelTarget(null)
    load()
    loadSummary()
  }

  const methodBadge = (m) => ({
    cash:          'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    visa:          'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    bank_transfer: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  }[m] || 'bg-gray-100 text-gray-600')

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('expenses.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('expenses.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {can('expenses.edit') && (
            <button onClick={() => setShowCats(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              <TagIcon className="w-4 h-4" />
              {t('expenses.categories')}
            </button>
          )}
          {can('expenses.create') && (
            <button onClick={() => { setEditing(null); setShowForm(true) }}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
              <PlusIcon className="w-4 h-4" />
              {t('expenses.add')}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                <BanknotesIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('expenses.total_period')}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(summary.total)}</p>
              </div>
            </div>
          </div>
          <div className="sm:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <ChartPieIcon className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('expenses.by_category')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(summary.by_category || []).map(c => (
                <div key={c.name} className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 rounded-lg px-2.5 py-1.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{c.name}</span>
                  <span className="text-xs font-semibold text-gray-900 dark:text-white">{formatCurrency(c.total)}</span>
                </div>
              ))}
              {!summary.by_category?.length && <p className="text-xs text-gray-400">{t('common.no_data')}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} onClear={() => { setSearch(''); pg.setPage(1) }} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('expenses.category')}</label>
            <select value={filterCat} onChange={e => { setFilterCat(e.target.value); pg.setPage(1) }}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="">{t('common.all')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('expenses.payment_method')}</label>
            <select value={filterMethod} onChange={e => { setFilterMethod(e.target.value); pg.setPage(1) }}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="">{t('common.all')}</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`expenses.methods.${m}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('common.from')}</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('common.to')}</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading && !rows.length ? (
          <TableSkeleton rows={8} cols={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  {[t('common.date'), t('expenses.category'), t('expenses.amount'), t('expenses.payment_method'), t('common.notes'), t('common.added_by'), ''].map((h, i) => (
                    <th key={i} className="text-start px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {!rows.length ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">{t('common.no_data')}</td></tr>
                ) : rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{formatDate(row.expense_date)}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.category_name}</td>
                    <td className="px-4 py-3 font-semibold text-red-600 dark:text-red-400">{formatCurrency(row.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${methodBadge(row.payment_method)}`}>
                        {t(`expenses.methods.${row.payment_method}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-xs truncate">{row.notes || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{row.created_by_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {can('expenses.edit') && (
                          <button onClick={() => { setEditing(row); setShowForm(true) }}
                            className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        )}
                        {can('expenses.delete') && (
                          <button onClick={() => setDelTarget(row)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pg.total > pg.perPage && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <Pagination page={pg.page} perPage={pg.perPage} total={pg.total} onPageChange={pg.setPage} />
          </div>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editing ? t('expenses.edit') : t('expenses.add')} size="md">
        <ExpenseForm categories={categories} initial={editing}
          onSave={() => { setShowForm(false); setEditing(null); load(); loadSummary() }}
          onClose={() => { setShowForm(false); setEditing(null) }} />
      </Modal>

      <Modal open={showCats} onClose={() => setShowCats(false)}
        title={t('expenses.manage_categories')} size="md">
        <CategoryModal onClose={() => setShowCats(false)} onSaved={loadCategories} />
      </Modal>

      <ConfirmDialog open={!!delTarget}
        title={t('expenses.delete_confirm')}
        message={t('expenses.delete_confirm_msg', { amount: formatCurrency(delTarget?.amount) })}
        confirmLabel={t('common.delete')}
        onConfirm={handleDelete} onClose={() => setDelTarget(null)} />
    </div>
  )
}

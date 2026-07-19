import { useState, useEffect, useCallback, useRef } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, stockStatus } from '../../utils/format'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useTranslation } from 'react-i18next'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost/pharm/backend/public'

function MedicineForm({ initial, categories, companies, onSubmit, loading }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(initial || {
    name: '', name_ar: '', scientific_name: '', barcode: '', sku: '', category_id: '', company_id: '',
    dosage_form: '', strength: '', unit: 'Piece', purchase_price: '', public_price: '',
    minimum_stock: 10, prescription_required: false, controlled_drug: false, description: '', is_active: true,
  })
  const [imageFile, setImageFile] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error(t('medicines.required_name'))
    if (!form.public_price) return toast.error(t('medicines.required_price'))

    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''))
    if (imageFile) fd.append('image', imageFile)
    onSubmit(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('medicines.name_en')}</label><input value={form.name} onChange={e => set('name', e.target.value)} className="input" required /></div>
        <div><label className="label">{t('medicines.name_ar')}</label><input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} className="input" dir="rtl" /></div>
      </div>
      <div><label className="label">{t('medicines.scientific_name')}</label><input value={form.scientific_name} onChange={e => set('scientific_name', e.target.value)} className="input" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('medicines.barcode')}</label><input value={form.barcode} onChange={e => set('barcode', e.target.value)} className="input font-mono" /></div>
        <div><label className="label">{t('medicines.sku')}</label><input value={form.sku} onChange={e => set('sku', e.target.value)} className="input font-mono" placeholder={t('medicines.sku_hint')} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">{t('medicines.category')}</label>
          <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className="input">
            <option value="">{t('common.select')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('medicines.company')}</label>
          <select value={form.company_id} onChange={e => set('company_id', e.target.value)} className="input">
            <option value="">{t('common.select')}</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><label className="label">{t('medicines.dosage_form')}</label><input value={form.dosage_form} onChange={e => set('dosage_form', e.target.value)} className="input" placeholder={t('medicines.dosage_placeholder')} /></div>
        <div><label className="label">{t('medicines.strength')}</label><input value={form.strength} onChange={e => set('strength', e.target.value)} className="input" placeholder={t('medicines.strength_placeholder')} /></div>
        <div><label className="label">{t('medicines.unit')}</label><input value={form.unit} onChange={e => set('unit', e.target.value)} className="input" /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><label className="label">{t('medicines.pharmacist_price')} *</label><input type="number" step="0.001" min="0" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} className="input" required /></div>
        <div><label className="label">{t('medicines.public_price')} *</label><input type="number" step="0.001" min="0" value={form.public_price} onChange={e => set('public_price', e.target.value)} className="input" required /></div>
        <div><label className="label">{t('medicines.min_stock')}</label><input type="number" min="0" value={form.minimum_stock} onChange={e => set('minimum_stock', e.target.value)} className="input" /></div>
      </div>
      <div>
        <label className="label">{t('medicines.image')}</label>
        <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files[0])} className="input p-1.5 cursor-pointer" />
        {initial?.image && !imageFile && (
          <img src={`${BASE_URL}/${initial.image}`} className="mt-2 h-16 w-16 rounded object-cover" alt="" />
        )}
      </div>
      <div><label className="label">{t('common.description')}</label><textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className="input resize-none" /></div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.prescription_required} onChange={e => set('prescription_required', e.target.checked)} className="rounded" />
          <span className="text-sm">{t('medicines.prescription')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.controlled_drug} onChange={e => set('controlled_drug', e.target.checked)} className="rounded" />
          <span className="text-sm">{t('medicines.controlled')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} className="rounded" />
          <span className="text-sm">{t('common.active')}</span>
        </label>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? t('common.saving') : (initial ? t('medicines.update') : t('medicines.add'))}</button>
    </form>
  )
}

export default function MedicinesPage() {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { get, del, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [companies, setCompanies] = useState([])
  const [modal, setModal] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const importRef = useRef(null)

  const load = useCallback(() => {
    get('/api/medicines', { page: pg.page, per_page: pg.perPage, search }).then(res => {
      setRows(res.data || []); pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      get('/api/categories', { per_page: 100 }, { silent: true }).catch(() => ({ data: [] })),
      get('/api/companies', { per_page: 100 }, { silent: true }).catch(() => ({ data: [] })),
    ]).then(([cats, comps]) => {
      setCategories(cats.data || [])
      setCompanies(comps.data || [])
    })
  }, [])

  const handleSave = async (fd) => {
    setSaving(true)
    try {
      if (editItem) {
        await api.post(`/api/medicines/${editItem.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success(t('medicines.updated'))
      } else {
        await api.post('/api/medicines', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success(t('medicines.added'))
      }
      setModal(null); setEditItem(null); load()
    } catch (err) {
      toast.error(err.response?.data?.message || t('medicines.save_failed'))
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await del(`/api/medicines/${delItem.id}`); toast.success(t('medicines.deactivated')); setDelItem(null); load() }
    catch {} finally { setDeleting(false) }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await api.post('/api/medicines/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(res.data.message)
      load()
    } catch (err) { toast.error(err.response?.data?.message || t('medicines.save_failed')) }
    e.target.value = ''
  }

  const handleExport = () => {
    const token = localStorage.getItem('access_token')
    window.open(`${BASE_URL}/api/medicines/export?token=${token}`, '_blank')
  }

  const ss = (current, min) => stockStatus(current, min)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('medicines.title')}</h1>
          <p className="text-sm text-gray-500">{t('medicines.count', { count: pg.total })}</p>
        </div>
        <div className="flex gap-2">
          {can('medicines.view') && <button onClick={handleExport} className="btn-secondary btn-sm"><ArrowDownTrayIcon className="w-4 h-4" /> {t('common.export')}</button>}
          {can('medicines.create') && (
            <>
              <button onClick={() => importRef.current?.click()} className="btn-secondary btn-sm"><ArrowUpTrayIcon className="w-4 h-4" /> {t('common.import')}</button>
              <input ref={importRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
              <button onClick={() => { setEditItem(null); setModal('form') }} className="btn-primary"><PlusIcon className="w-4 h-4" /> {t('medicines.add')}</button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} placeholder={t('common.search')} className="max-w-sm" />
        </div>

        {loading && !rows.length ? <TableSkeleton rows={6} cols={8} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('medicines.col_medicine')}</th>
                  <th>{t('medicines.col_barcode')}</th>
                  <th>{t('medicines.col_category')}</th>
                  <th>{t('medicines.col_pharmacist_price')}</th>
                  <th>{t('medicines.col_public_price')}</th>
                  <th>{t('medicines.col_stock')}</th>
                  <th>{t('medicines.col_flags')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const s = ss(row.current_stock, row.minimum_stock)
                  return (
                    <tr key={row.id}>
                      <td className="text-gray-400">{(pg.page - 1) * pg.perPage + i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          {row.image ? (
                            <img src={`${BASE_URL}/${row.image}`} className="w-8 h-8 rounded object-cover" alt="" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 text-xs font-bold">
                              {row.name?.[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                            {row.name_ar && <p className="text-xs text-gray-400" dir="rtl">{row.name_ar}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-xs text-gray-500">{row.barcode || row.sku}</td>
                      <td>{row.category_name || '—'}</td>
                      <td>{formatCurrency(row.purchase_price)}</td>
                      <td className="font-semibold">{formatCurrency(row.public_price)}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{row.current_stock}</span>
                          <span className={`badge badge-${s.color}`}>{s.label}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {row.prescription_required ? <span className="badge badge-blue">{t('medicines.rx')}</span> : null}
                          {row.controlled_drug ? <span className="badge badge-red">{t('medicines.controlled_short')}</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {can('medicines.edit') && <button onClick={() => { setEditItem(row); setModal('form') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600"><PencilIcon className="w-4 h-4" /></button>}
                          {can('medicines.delete') && <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && !loading && <tr><td colSpan={8} className="text-center text-gray-400 py-12">{t('medicines.no_medicines')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'form'} onClose={() => { setModal(null); setEditItem(null) }} title={editItem ? t('medicines.update') : t('medicines.add')} size="xl">
        <MedicineForm initial={editItem} categories={categories} companies={companies} onSubmit={handleSave} loading={saving} />
      </Modal>

      <ConfirmDialog
        open={!!delItem}
        onClose={() => setDelItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title={t('medicines.deactivate_title')}
        message={t('medicines.deactivate_confirm', { name: delItem?.name })}
        confirmLabel={t('medicines.deactivate_btn')}
      />
    </div>
  )
}

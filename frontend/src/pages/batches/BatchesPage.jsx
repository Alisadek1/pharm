import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDate, expiryStatus } from '../../utils/format'
import toast from 'react-hot-toast'

function BatchForm({ initial, medicines, suppliers, onSubmit, loading }) {
  const [form, setForm] = useState(initial || {
    medicine_id: '', supplier_id: '', batch_number: '', manufacturing_date: '',
    expiry_date: '', purchase_price: '', selling_price: '', quantity: '', notes: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.medicine_id) return toast.error('Medicine is required')
    if (!form.batch_number.trim()) return toast.error('Batch number is required')
    if (!form.expiry_date) return toast.error('Expiry date is required')
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Medicine *</label>
        <select value={form.medicine_id} onChange={e => set('medicine_id', e.target.value)} className="input" required disabled={!!initial}>
          <option value="">— Select Medicine —</option>
          {medicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Batch Number *</label><input value={form.batch_number} onChange={e => set('batch_number', e.target.value)} className="input font-mono" required disabled={!!initial} /></div>
        <div>
          <label className="label">Supplier</label>
          <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className="input">
            <option value="">— None —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Manufacturing Date</label><input type="date" value={form.manufacturing_date} onChange={e => set('manufacturing_date', e.target.value)} className="input" /></div>
        <div><label className="label">Expiry Date *</label><input type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} className="input" required /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><label className="label">Pharmacist Price *</label><input type="number" step="0.001" min="0" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} className="input" required /></div>
        <div><label className="label">Public Price *</label><input type="number" step="0.001" min="0" value={form.selling_price} onChange={e => set('selling_price', e.target.value)} className="input" required /></div>
        <div><label className="label">Quantity {initial ? '' : '*'}</label><input type="number" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} className="input" required={!initial} /></div>
      </div>
      <div><label className="label">Notes</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="input resize-none" /></div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving...' : (initial ? 'Update Batch' : 'Add Batch')}</button>
    </form>
  )
}

export default function BatchesPage() {
  const { can } = useAuth()
  const { get, post, put, del, loading } = useApi()
  const pg = usePagination()
  const [rows, setRows] = useState([])
  const [medicines, setMedicines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [modal, setModal] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [searchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState(searchParams.get('filter') || '')

  const load = useCallback(() => {
    get('/api/batches', { page: pg.page, per_page: pg.perPage, status: statusFilter }).then(res => {
      setRows(res.data || []); pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, statusFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      get('/api/medicines', { per_page: 200, is_active: 1 }, { silent: true }).catch(() => ({ data: [] })),
      get('/api/suppliers', { per_page: 100 }, { silent: true }).catch(() => ({ data: [] })),
    ]).then(([meds, supps]) => { setMedicines(meds.data || []); setSuppliers(supps.data || []) })
  }, [])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      editItem ? await put(`/api/batches/${editItem.id}`, form) : await post('/api/batches', form)
      toast.success(editItem ? 'Updated' : 'Batch added')
      setModal(null); setEditItem(null); load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await del(`/api/batches/${delItem.id}`); toast.success('Deleted'); setDelItem(null); load() }
    catch {} finally { setDeleting(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Batch Management</h1><p className="text-sm text-gray-500">{pg.total} batches</p></div>
        {can('batches.create') && <button onClick={() => { setEditItem(null); setModal('form') }} className="btn-primary"><PlusIcon className="w-4 h-4" /> Add Batch</button>}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex gap-2 flex-wrap">
          {['', 'active', 'near_expiry', 'expired', 'out_of_stock'].map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); pg.setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {s === '' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>

        {loading && !rows.length ? <TableSkeleton rows={6} cols={8} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Batch #</th><th>Medicine</th><th>Supplier</th><th>Mfg Date</th><th>Expiry</th><th>Pharmacist Price</th><th>Public Price</th><th>Qty</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const exp = expiryStatus(row.expiry_date)
                  return (
                    <tr key={row.id}>
                      <td className="font-mono text-xs font-semibold">{row.batch_number}</td>
                      <td>
                        <p className="font-medium text-gray-900 dark:text-white">{row.medicine_name}</p>
                        <p className="text-xs text-gray-400">{row.medicine_name_ar}</p>
                      </td>
                      <td>{row.supplier_name || '—'}</td>
                      <td>{formatDate(row.manufacturing_date)}</td>
                      <td>
                        <span className={`badge badge-${exp.color}`}>{exp.label}</span>
                      </td>
                      <td>{formatCurrency(row.purchase_price)}</td>
                      <td className="font-semibold">{formatCurrency(row.selling_price)}</td>
                      <td className={`font-bold ${row.quantity === 0 ? 'text-red-500' : row.quantity < 10 ? 'text-amber-500' : 'text-gray-900 dark:text-white'}`}>
                        {row.quantity}
                      </td>
                      <td>
                        <span className={`badge badge-${row.status === 'active' ? 'green' : row.status === 'near_expiry' ? 'yellow' : row.status === 'expired' ? 'red' : 'gray'}`}>
                          {row.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {can('batches.edit') && <button onClick={() => { setEditItem(row); setModal('form') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600"><PencilIcon className="w-4 h-4" /></button>}
                          {can('batches.delete') && <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && !loading && <tr><td colSpan={10} className="text-center text-gray-400 py-12">No batches found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'form'} onClose={() => { setModal(null); setEditItem(null) }} title={editItem ? 'Edit Batch' : 'Add Batch'} size="lg">
        <BatchForm initial={editItem} medicines={medicines} suppliers={suppliers} onSubmit={handleSave} loading={saving} />
      </Modal>
      <ConfirmDialog open={!!delItem} onClose={() => setDelItem(null)} onConfirm={handleDelete} loading={deleting} title="Delete Batch" message={`Delete batch "${delItem?.batch_number}"?`} />
    </div>
  )
}

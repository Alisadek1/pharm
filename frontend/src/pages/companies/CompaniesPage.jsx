import { useState, useEffect, useCallback } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

function CompanyForm({ initial, onSubmit, loading }) {
  const [form, setForm] = useState(initial || { name: '', name_ar: '', country: '', phone: '', email: '', address: '', website: '', is_active: true })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) return toast.error('Name required'); onSubmit(form) }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Name (EN) *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">Name (AR)</label>
          <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} className="input" dir="rtl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Country</label>
          <input value={form.country} onChange={e => set('country', e.target.value)} className="input" placeholder="Saudi Arabia" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Email</label>
        <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="input" />
      </div>
      <div>
        <label className="label">Website</label>
        <input value={form.website} onChange={e => set('website', e.target.value)} className="input" placeholder="https://..." />
      </div>
      <div>
        <label className="label">Address</label>
        <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} className="input resize-none" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="active" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} className="rounded" />
        <label htmlFor="active" className="text-sm">Active</label>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving...' : (initial ? 'Update' : 'Create Company')}</button>
    </form>
  )
}

export default function CompaniesPage() {
  const { can } = useAuth()
  const { get, post, put, del, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    get('/api/companies', { page: pg.page, per_page: pg.perPage, search }).then(res => { setRows(res.data || []); pg.updateMeta(res.meta) })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      editItem ? await put(`/api/companies/${editItem.id}`, form) : await post('/api/companies', form)
      toast.success(editItem ? 'Updated' : 'Created')
      setModal(null); setEditItem(null); load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await del(`/api/companies/${delItem.id}`); toast.success('Deleted'); setDelItem(null); load() }
    catch {} finally { setDeleting(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Companies</h1>
          <p className="text-sm text-gray-500">{pg.total} manufacturers</p>
        </div>
        {can('companies.create') && (
          <button onClick={() => { setEditItem(null); setModal('form') }} className="btn-primary">
            <PlusIcon className="w-4 h-4" /> Add Company
          </button>
        )}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} placeholder="Search companies..." className="max-w-xs" />
        </div>

        {loading && !rows.length ? <TableSkeleton rows={5} cols={6} /> : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>#</th><th>Company</th><th>Country</th><th>Phone</th><th>Email</th><th>Medicines</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="text-gray-400">{(pg.page - 1) * pg.perPage + i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                          <BuildingOfficeIcon className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                          {row.name_ar && <p className="text-xs text-gray-400" dir="rtl">{row.name_ar}</p>}
                        </div>
                      </div>
                    </td>
                    <td>{row.country || '—'}</td>
                    <td>{row.phone || '—'}</td>
                    <td>{row.email || '—'}</td>
                    <td><span className="badge badge-blue">{row.medicine_count}</span></td>
                    <td><span className={row.is_active ? 'badge badge-green' : 'badge badge-gray'}>{row.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="flex gap-1">
                        {can('companies.edit') && <button onClick={() => { setEditItem(row); setModal('form') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600"><PencilIcon className="w-4 h-4" /></button>}
                        {can('companies.delete') && <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && <tr><td colSpan={8} className="text-center text-gray-400 py-12">No companies found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'form'} onClose={() => { setModal(null); setEditItem(null) }} title={editItem ? 'Edit Company' : 'New Company'}>
        <CompanyForm initial={editItem} onSubmit={handleSave} loading={saving} />
      </Modal>
      <ConfirmDialog open={!!delItem} onClose={() => setDelItem(null)} onConfirm={handleDelete} loading={deleting} title="Delete Company" message={`Delete "${delItem?.name}"?`} />
    </div>
  )
}

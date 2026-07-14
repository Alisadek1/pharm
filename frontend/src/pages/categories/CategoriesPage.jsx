import { useState, useEffect, useCallback } from 'react'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useApi } from '../../hooks/useApi'
import { usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import toast from 'react-hot-toast'
import { formatDateTime } from '../../utils/format'
import { useAuth } from '../../context/AuthContext'

function CategoryForm({ initial, onSubmit, loading }) {
  const [form, setForm] = useState(initial || { name: '', name_ar: '', description: '', is_active: true })

  const handleChange = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Category name is required')
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Name (English) <span className="text-red-500">*</span></label>
        <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} className="input" placeholder="e.g. Antibiotics" required />
      </div>
      <div>
        <label className="label">Name (Arabic)</label>
        <input value={form.name_ar} onChange={(e) => handleChange('name_ar', e.target.value)} className="input" dir="rtl" placeholder="مضادات حيوية" />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea value={form.description} onChange={(e) => handleChange('description', e.target.value)} rows={3} className="input resize-none" placeholder="Optional description..." />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="active" checked={!!form.is_active} onChange={(e) => handleChange('is_active', e.target.checked)} className="rounded" />
        <label htmlFor="active" className="text-sm text-gray-700 dark:text-gray-300">Active</label>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? 'Saving...' : (initial ? 'Update Category' : 'Create Category')}
        </button>
      </div>
    </form>
  )
}

export default function CategoriesPage() {
  const { can } = useAuth()
  const { get, post, put, del, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch]       = useState('')
  const [rows, setRows]           = useState([])
  const [modal, setModal]         = useState(null)
  const [editItem, setEditItem]   = useState(null)
  const [delItem, setDelItem]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)

  const load = useCallback(() => {
    get('/api/categories', { page: pg.page, per_page: pg.perPage, search }).then((res) => {
      setRows(res.data || [])
      pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditItem(null); setModal('form') }
  const openEdit   = (item) => { setEditItem(item); setModal('form') }
  const closeModal = () => { setModal(null); setEditItem(null) }

  const handleSave = async (form) => {
    setSaving(true)
    try {
      const params = new URLSearchParams(form).toString()
      if (editItem) {
        await put(`/api/categories/${editItem.id}`, form)
        toast.success('Category updated')
      } else {
        await post('/api/categories', form)
        toast.success('Category created')
      }
      closeModal()
      load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await del(`/api/categories/${delItem.id}`)
      toast.success('Category deleted')
      setDelItem(null)
      load()
    } catch {} finally { setDeleting(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pg.total} total categories</p>
        </div>
        {can('categories.create') && (
          <button onClick={openCreate} className="btn-primary">
            <PlusIcon className="w-4 h-4" /> Add Category
          </button>
        )}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <SearchInput value={search} onChange={(v) => { setSearch(v); pg.setPage(1) }} placeholder="Search categories..." className="max-w-xs" />
        </div>

        {loading && !rows.length ? <TableSkeleton rows={5} cols={5} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Arabic Name</th>
                  <th>Medicines</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="text-gray-400">{(pg.page - 1) * pg.perPage + idx + 1}</td>
                    <td className="font-medium text-gray-900 dark:text-white">{row.name}</td>
                    <td dir="rtl" className="font-medium">{row.name_ar || '—'}</td>
                    <td><span className="badge badge-blue">{row.medicine_count}</span></td>
                    <td>
                      <span className={row.is_active ? 'badge badge-green' : 'badge badge-gray'}>
                        {row.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td>
                      <div className="flex gap-1">
                        {can('categories.edit') && (
                          <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600 transition-colors">
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        )}
                        {can('categories.delete') && (
                          <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-12">No categories found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'form'} onClose={closeModal} title={editItem ? 'Edit Category' : 'New Category'} size="sm">
        <CategoryForm initial={editItem} onSubmit={handleSave} loading={saving} />
      </Modal>

      <ConfirmDialog
        open={!!delItem}
        onClose={() => setDelItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Category"
        message={`Are you sure you want to delete "${delItem?.name}"? This cannot be undone.`}
      />
    </div>
  )
}

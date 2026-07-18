import { useState, useEffect, useCallback } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, ShieldCheckIcon, ClockIcon } from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../context/AuthContext'
import { formatDateTime } from '../../utils/format'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useTranslation } from 'react-i18next'

const ROLE_COLORS = { owner: 'badge-red', admin: 'badge-purple', pharmacist: 'badge-blue', cashier: 'badge-green', inventory_manager: 'badge-amber' }

function UserForm({ initial, roles, onSubmit, loading }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(initial ? {
    name: initial.name, email: initial.email, phone: initial.phone || '',
    role_id: initial.role_id, is_active: initial.is_active, password: '', password_confirmation: '',
  } : { name: '', email: '', phone: '', role_id: '', is_active: true, password: '', password_confirmation: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error(t('users.required_name'))
    if (!form.email.trim()) return toast.error(t('users.required_email'))
    if (!form.role_id) return toast.error(t('users.required_role'))
    if (!initial && !form.password) return toast.error(t('users.required_password'))
    if (form.password && form.password !== form.password_confirmation) return toast.error(t('users.password_mismatch'))
    if (form.password && form.password.length < 8) return toast.error(t('users.password_length'))
    const data = { ...form }
    if (!data.password) { delete data.password; delete data.password_confirmation }
    onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{t('users.full_name')} *</label><input value={form.name} onChange={e => set('name', e.target.value)} className="input" required /></div>
        <div><label className="label">{t('common.phone')}</label><input value={form.phone} onChange={e => set('phone', e.target.value)} className="input" /></div>
      </div>
      <div><label className="label">{t('common.email')} *</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="input" required /></div>
      <div>
        <label className="label">{t('users.role')} *</label>
        <select value={form.role_id} onChange={e => set('role_id', e.target.value)} className="input" required>
          <option value="">— Select Role —</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.display_name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">{initial ? t('users.new_password') : t('users.password') + ' *'}</label><input type="password" value={form.password} onChange={e => set('password', e.target.value)} className="input" placeholder={initial ? t('users.leave_blank') : ''} /></div>
        <div><label className="label">{t('users.confirm_password')}</label><input type="password" value={form.password_confirmation} onChange={e => set('password_confirmation', e.target.value)} className="input" /></div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} className="rounded" />
        <span className="text-sm text-gray-700 dark:text-gray-300">{t('users.active_account')}</span>
      </label>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? t('common.saving') : (initial ? t('users.update') : t('users.add'))}</button>
    </form>
  )
}

function PermissionsModal({ userId, userPerms, allPerms, onClose }) {
  const { t } = useTranslation()
  const [grants, setGrants] = useState(() => {
    const map = {}
    ;(userPerms || []).forEach(p => { map[p.permission_id] = p.granted })
    return map
  })
  const [saving, setSaving] = useState(false)

  const grouped = allPerms.reduce((acc, p) => {
    const mod = p.module || 'Other'
    if (!acc[mod]) acc[mod] = []
    acc[mod].push(p)
    return acc
  }, {})

  const toggle = (permId, val) => setGrants(g => {
    const next = { ...g }
    if (val === null) delete next[permId]
    else next[permId] = val
    return next
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      const permissions = Object.entries(grants).map(([permission_id, granted]) => ({ permission_id: parseInt(permission_id), granted }))
      await api.put(`/api/users/${userId}/permissions`, { permissions })
      toast.success(t('users.permissions_updated'))
      onClose()
    } catch { toast.error(t('users.permissions_failed')) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('users.permissions_hint')}</p>
      <div className="max-h-96 overflow-y-auto space-y-4 pe-1">
        {Object.entries(grouped).map(([module, perms]) => (
          <div key={module}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{module}</h4>
            <div className="space-y-1">
              {perms.map(p => {
                const val = grants[p.id]
                return (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.display_name}</p>
                      <p className="text-xs text-gray-400">{p.name}</p>
                    </div>
                    <div className="flex gap-1">
                      {[
                        { v: null, label: t('users.perm_default'), cls: val === null || val === undefined ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700' },
                        { v: 1, label: t('users.perm_allow'), cls: val === 1 ? 'bg-green-500 text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700' },
                        { v: 0, label: t('users.perm_deny'), cls: val === 0 ? 'bg-red-500 text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700' },
                      ].map(btn => (
                        <button key={btn.label} onClick={() => toggle(p.id, btn.v)} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${btn.cls}`}>{btn.label}</button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <button onClick={onClose} className="btn-secondary flex-1">{t('common.cancel')}</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? t('common.saving') : t('users.save_permissions')}</button>
      </div>
    </div>
  )
}

function ActivityLogModal({ userId }) {
  const { t } = useTranslation()
  const { get, loading } = useApi()
  const [logs, setLogs] = useState([])

  useEffect(() => {
    get(`/api/users/${userId}/activity`, { per_page: 50 }).then(res => setLogs(res.data || []))
  }, [userId])

  if (loading) return <TableSkeleton rows={5} cols={3} />

  return (
    <div className="max-h-96 overflow-y-auto space-y-1">
      {logs.length === 0 && <p className="text-center text-gray-400 py-8">{t('settings.no_activity')}</p>}
      {logs.map(log => (
        <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
          <div className="w-2 h-2 rounded-full bg-primary-400 mt-2 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 dark:text-gray-200">
              <span className="font-medium capitalize">{log.action?.replace(/_/g, ' ')}</span>
              {log.entity_type && <span className="text-gray-400"> on {log.entity_type}#{log.entity_id}</span>}
            </p>
            {log.description && <p className="text-xs text-gray-400 truncate">{log.description}</p>}
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">{formatDateTime(log.created_at)}</span>
        </div>
      ))}
    </div>
  )
}

export default function UsersPage() {
  const { t } = useTranslation()
  const { can, user: currentUser } = useAuth()
  const { get, post, put, del, loading } = useApi()
  const pg = usePagination()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [roles, setRoles] = useState([])
  const [allPerms, setAllPerms] = useState([])
  const [modal, setModal] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [delItem, setDelItem] = useState(null)
  const [permUser, setPermUser] = useState(null)
  const [userPerms, setUserPerms] = useState([])
  const [actUser, setActUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    get('/api/users', { page: pg.page, per_page: pg.perPage, search }).then(res => {
      setRows(res.data || []); pg.updateMeta(res.meta)
    })
  }, [pg.page, pg.perPage, search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    get('/api/roles').then(res => setRoles(res.data || []))
    get('/api/permissions').then(res => setAllPerms(res.data || []))
  }, [])

  const openPermissions = async (user) => {
    const res = await get(`/api/users/${user.id}/permissions`)
    setUserPerms(res.data || [])
    setPermUser(user)
    setModal('perms')
  }

  const handleSave = async (form) => {
    setSaving(true)
    try {
      editItem ? await put(`/api/users/${editItem.id}`, form) : await post('/api/users', form)
      toast.success(editItem ? t('users.updated') : t('users.created'))
      setModal(null); setEditItem(null); load()
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await del(`/api/users/${delItem.id}`); toast.success(t('users.deleted')); setDelItem(null); load() }
    catch {} finally { setDeleting(false) }
  }

  const toggleActive = async (user) => {
    try {
      await api.patch(`/api/users/${user.id}/toggle-active`)
      toast.success(user.is_active ? t('users.deactivated') : t('users.activated'))
      load()
    } catch { toast.error(t('users.status_failed')) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('users.title')}</h1>
          <p className="text-sm text-gray-500">{t('users.count', { count: pg.total })}</p>
        </div>
        {can('users.create') && (
          <button onClick={() => { setEditItem(null); setModal('form') }} className="btn-primary"><PlusIcon className="w-4 h-4" /> {t('users.add')}</button>
        )}
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <SearchInput value={search} onChange={v => { setSearch(v); pg.setPage(1) }} placeholder={t('common.search')} className="max-w-sm" />
        </div>

        {loading && !rows.length ? <TableSkeleton rows={5} cols={6} /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('users.col_user')}</th>
                  <th>{t('common.email')}</th>
                  <th>{t('users.col_role')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('users.col_last_login')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {row.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{row.name} {row.id === currentUser?.id && <span className="text-xs text-primary-500">({t('users.you')})</span>}</p>
                          {row.phone && <p className="text-xs text-gray-400">{row.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="text-sm">{row.email}</td>
                    <td>
                      <span className={`badge ${ROLE_COLORS[row.role_name] || 'badge-gray'}`}>
                        {row.role_display_name || row.role_name}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => toggleActive(row)} disabled={row.id === currentUser?.id}
                        className={`badge cursor-pointer transition-colors ${row.is_active ? 'badge-green hover:bg-red-50 hover:text-red-600' : 'badge-red hover:bg-green-50 hover:text-green-600'}`}>
                        {row.is_active ? t('common.active') : t('common.inactive')}
                      </button>
                    </td>
                    <td className="text-xs text-gray-400">{row.last_login_at ? formatDateTime(row.last_login_at) : t('users.never')}</td>
                    <td>
                      <div className="flex gap-1">
                        {can('users.edit') && (
                          <button onClick={() => { setEditItem(row); setModal('form') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-primary-600" title={t('common.edit')}>
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        )}
                        {can('users.permissions') && (
                          <button onClick={() => openPermissions(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-amber-500" title={t('users.permissions')}>
                            <ShieldCheckIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => { setActUser(row); setModal('activity') }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500" title={t('users.activity')}>
                          <ClockIcon className="w-4 h-4" />
                        </button>
                        {can('users.delete') && row.id !== currentUser?.id && (
                          <button onClick={() => setDelItem(row)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500" title={t('common.delete')}>
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && <tr><td colSpan={6} className="text-center text-gray-400 py-12">{t('users.no_users')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
      </div>

      <Modal open={modal === 'form'} onClose={() => { setModal(null); setEditItem(null) }} title={editItem ? t('users.update') : t('users.add')} size="md">
        <UserForm initial={editItem} roles={roles} onSubmit={handleSave} loading={saving} />
      </Modal>

      <Modal open={modal === 'perms'} onClose={() => setModal(null)} title={`${t('users.permissions')} — ${permUser?.name}`} size="lg">
        {permUser && <PermissionsModal userId={permUser.id} userPerms={userPerms} allPerms={allPerms} onClose={() => setModal(null)} />}
      </Modal>

      <Modal open={modal === 'activity'} onClose={() => { setModal(null); setActUser(null) }} title={`${t('users.activity')} — ${actUser?.name}`} size="lg">
        {actUser && <ActivityLogModal userId={actUser.id} />}
      </Modal>

      <ConfirmDialog open={!!delItem} onClose={() => setDelItem(null)} onConfirm={handleDelete} loading={deleting}
        title={t('users.delete_title')} message={t('users.delete_confirm', { name: delItem?.name })} confirmLabel={t('common.delete')} />
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import {
  ArrowPathIcon, CheckCircleIcon, XCircleIcon, ClockIcon,
  Cog6ToothIcon, ListBulletIcon,
} from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import Pagination from '../../components/ui/Pagination'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { formatDateTime } from '../../utils/format'
import toast from 'react-hot-toast'
import api from '../../services/api'

const TAB = { settings: 'settings', history: 'history' }

function StatusBadge({ status }) {
  const map = {
    running:   'badge badge-blue',
    completed: 'badge badge-green',
    failed:    'badge badge-red',
  }
  return <span className={map[status] || 'badge'}>{status}</span>
}

export default function IntegrationPage() {
  const { can } = useAuth()
  const { get, loading } = useApi()
  const pg = usePagination()
  const [tab, setTab] = useState(TAB.settings)
  const [settings, setSettings] = useState({
    rsd_api_url: '', rsd_api_key: '', rsd_api_secret: '', rsd_sync_interval: '24', rsd_enabled: '0',
  })
  const [history, setHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [secretChanged, setSecretChanged] = useState(false)

  useEffect(() => {
    get('/api/drug-sync/settings').then(res => {
      if (res.data) setSettings(prev => ({ ...prev, ...res.data }))
    })
  }, [])

  const loadHistory = useCallback(() => {
    get('/api/drug-sync/history', { page: pg.page }).then(res => {
      setHistory(res.data || [])
      pg.updateMeta(res.meta)
    })
  }, [pg.page])

  useEffect(() => {
    if (tab === TAB.history) loadHistory()
  }, [tab, loadHistory])

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(settings).forEach(([k, v]) => {
        if (k === 'rsd_api_secret' && !secretChanged) return
        fd.append(k, v)
      })
      await api.post('/api/drug-sync/settings', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Integration settings saved')
      setSecretChanged(false)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings')
    } finally { setSaving(false) }
  }

  const handleSync = async () => {
    if (!can('settings.edit')) return toast.error('Permission denied')
    setSyncing(true)
    try {
      const res = await api.post('/api/drug-sync/sync')
      toast.success(res.data?.message || 'Sync completed successfully')
      if (tab === TAB.history) loadHistory()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sync failed')
    } finally { setSyncing(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Saudi RSD Integration</h1>
          <p className="text-sm text-gray-500">Sync drug data from Saudi RSD (Registration System for Drugs)</p>
        </div>
        {can('settings.edit') && settings.rsd_enabled === '1' && (
          <button onClick={handleSync} disabled={syncing} className="btn-primary">
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Run Sync Now'}
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {[
          { id: TAB.settings, label: 'Settings',     icon: Cog6ToothIcon },
          { id: TAB.history,  label: 'Sync History', icon: ListBulletIcon },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary-600 text-primary-700 dark:text-primary-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          )
        })}
      </div>

      {/* Settings Tab */}
      {tab === TAB.settings && (
        <div className="card p-6 space-y-6 max-w-2xl">
          {/* Enable toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Enable RSD Integration</p>
              <p className="text-sm text-gray-500 mt-0.5">Activate automatic drug data synchronization</p>
            </div>
            <button type="button"
              onClick={() => set('rsd_enabled', settings.rsd_enabled === '1' ? '0' : '1')}
              className={`relative w-12 h-6 rounded-full transition-colors ${settings.rsd_enabled === '1' ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.rsd_enabled === '1' ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">API URL *</label>
              <input value={settings.rsd_api_url} onChange={e => set('rsd_api_url', e.target.value)} className="input font-mono text-sm" placeholder="https://api.rsd.gov.sa/v1" />
              <p className="text-xs text-gray-400 mt-1">Base URL of the Saudi RSD API endpoint</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">API Key</label>
                <input value={settings.rsd_api_key} onChange={e => set('rsd_api_key', e.target.value)} className="input font-mono text-sm" placeholder="your-api-key" />
              </div>
              <div>
                <label className="label">API Secret</label>
                <input
                  type="password"
                  value={secretChanged ? settings.rsd_api_secret : (settings.rsd_api_secret_masked || settings.rsd_api_secret || '')}
                  onChange={e => { set('rsd_api_secret', e.target.value); setSecretChanged(true) }}
                  className="input font-mono text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div>
              <label className="label">Sync Interval (hours)</label>
              <select value={settings.rsd_sync_interval} onChange={e => set('rsd_sync_interval', e.target.value)} className="input w-40">
                {[6, 12, 24, 48, 72].map(h => <option key={h} value={h}>{h}h</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">How often to automatically sync drug data</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button onClick={handleSave} disabled={saving || !can('settings.edit')} className="btn-primary">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {settings.rsd_enabled === '1' && (
              <button onClick={handleSync} disabled={syncing || !can('settings.edit')} className="btn-secondary">
                <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Test & Sync Now'}
              </button>
            )}
          </div>

          {/* Info box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <p className="font-semibold">How sync works:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Matches medicines by Barcode → GTIN → Saudi Drug Code → Name</li>
              <li>Updates: Public Price, Availability, Drug Information</li>
              <li>Only updates medicines already in your database</li>
              <li>All sync operations are logged in Sync History</li>
            </ul>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === TAB.history && (
        <div className="card">
          {loading && !history.length ? <TableSkeleton rows={8} cols={7} /> : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Provider</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Checked</th>
                    <th>Updated</th>
                    <th>Failed</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => {
                    const duration = row.completed_at
                      ? Math.round((new Date(row.completed_at) - new Date(row.started_at)) / 1000)
                      : null
                    return (
                      <tr key={row.id}>
                        <td className="font-mono text-xs text-gray-400">#{row.id}</td>
                        <td><span className="badge badge-blue">{row.provider}</span></td>
                        <td className="capitalize">{row.sync_type}</td>
                        <td><StatusBadge status={row.status} /></td>
                        <td className="text-center">{row.medicines_checked}</td>
                        <td className="text-center font-semibold text-green-600">{row.medicines_updated}</td>
                        <td className="text-center font-semibold text-red-500">{row.medicines_failed}</td>
                        <td className="text-xs">{formatDateTime(row.started_at)}</td>
                        <td className="text-xs text-gray-400">{duration !== null ? `${duration}s` : row.status === 'running' ? <ClockIcon className="w-4 h-4 animate-pulse" /> : '—'}</td>
                        <td className="text-xs">{row.triggered_by_name || 'System'}</td>
                      </tr>
                    )
                  })}
                  {!history.length && !loading && (
                    <tr><td colSpan={10} className="text-center text-gray-400 py-12">No sync history yet. Run a sync to see results here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={pg.page} totalPages={pg.totalPages} total={pg.total} perPage={pg.perPage} onPageChange={pg.setPage} />
        </div>
      )}
    </div>
  )
}

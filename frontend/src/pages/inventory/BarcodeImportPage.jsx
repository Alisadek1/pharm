import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import api from '../../services/api'
import {
  QrCodeIcon, MagnifyingGlassIcon, ArrowUpTrayIcon,
  CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon,
  InformationCircleIcon, LinkIcon, PlusCircleIcon,
  XMarkIcon, ClockIcon,
} from '@heroicons/react/24/outline'
import { useApi, usePagination } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { TableSkeleton } from '../../components/ui/Skeleton'

// ── Inline spinner ────────────────────────────────────────────
function Spin() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Barcode format + checksum badges ─────────────────────────
function BarcodeInfo({ format, validChecksum, length }) {
  const { t } = useTranslation()
  const isGtin = ['EAN-13', 'EAN-8', 'UPC-A', 'GTIN-14'].includes(format)

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
        {format}
      </span>
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
        {length} {t('barcodes.digits')}
      </span>
      {isGtin && (
        validChecksum === true
          ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
              <CheckCircleIcon className="w-3.5 h-3.5" /> {t('barcodes.checksum_valid')}
            </span>
          : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
              <XCircleIcon className="w-3.5 h-3.5" /> {t('barcodes.checksum_invalid')}
            </span>
      )}
    </div>
  )
}

// ── External source result card ───────────────────────────────
function ExternalCard({ data }) {
  const { t } = useTranslation()
  const fields = [
    { key: 'name',         label: t('medicines.name') },
    { key: 'manufacturer', label: t('barcodes.manufacturer') },
    { key: 'quantity',     label: t('barcodes.quantity') },
    { key: 'dosage_form',  label: t('medicines.dosage_form') },
    { key: 'strength',     label: t('medicines.strength') },
  ]
  return (
    <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <InformationCircleIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
          {data.source?.toUpperCase()}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {fields.map(f => data[f.key] ? (
          <div key={f.key}>
            <dt className="text-gray-500 dark:text-gray-400 text-xs">{f.label}</dt>
            <dd className="font-medium text-gray-900 dark:text-white truncate">{data[f.key]}</dd>
          </div>
        ) : null)}
      </dl>
      {data.source_url && (
        <a href={data.source_url} target="_blank" rel="noopener noreferrer"
          className="mt-3 block text-xs text-blue-500 hover:underline truncate">
          {data.source_url}
        </a>
      )}
    </div>
  )
}

// ── Medicine typeahead search ─────────────────────────────────
function MedicineSearch({ onSelect, placeholder }) {
  const { t } = useTranslation()
  const [q, setQ]           = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]     = useState(false)
  const [busy, setBusy]     = useState(false)
  const timerRef            = useRef(null)

  const search = (val) => {
    setQ(val)
    clearTimeout(timerRef.current)
    if (val.length < 2) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(async () => {
      setBusy(true)
      try {
        const res = await api.get('/api/medicines/search', { params: { q: val } })
        setResults(res.data?.data || [])
        setOpen(true)
      } catch { /* silently ignore */ }
      finally { setBusy(false) }
    }, 300)
  }

  const pick = (med) => {
    setQ(med.name)
    setOpen(false)
    setResults([])
    onSelect(med)
  }

  return (
    <div className="relative">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={q}
          onChange={e => search(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder || t('barcodes.search_medicine')}
          className="input w-full pl-9 text-sm"
        />
        {busy && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 max-h-52 overflow-y-auto">
          {results.map(m => (
            <li key={m.id}>
              <button type="button"
                className="w-full px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                onMouseDown={() => pick(m)}>
                <div className="font-medium text-gray-900 dark:text-white">{m.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {m.sku}
                  {m.barcode ? ` · ${m.barcode}` : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Tab 1 — Lookup
// ══════════════════════════════════════════════════════════════
function LookupTab({ can }) {
  const { t }              = useTranslation()
  const { post, loading }  = useApi()

  const [barcode, setBarcode]           = useState('')
  const [sources, setSources]           = useState({ local: true, opf: true, gs1: false })
  const [result, setResult]             = useState(null)
  const [modal, setModal]               = useState(null)  // 'create' | 'link_medicine'
  const [actionBusy, setActionBusy]     = useState(false)
  const [newName, setNewName]           = useState('')
  const [linkedMed, setLinkedMed]       = useState(null)

  const activeSources = Object.entries(sources).filter(([, v]) => v).map(([k]) => k)

  const lookup = async () => {
    if (!barcode.trim()) return
    try {
      const res = await post('/api/barcodes/lookup', {
        barcode: barcode.trim(),
        sources: activeSources,
      })
      setResult(res.data)
    } catch { /* toast shown by hook */ }
  }

  const reset = () => { setBarcode(''); setResult(null) }

  const executeImport = async (action, extra = {}) => {
    setActionBusy(true)
    try {
      await post('/api/barcodes/import', {
        barcode: result.barcode,
        action,
        source: result.opf?.found ? 'opf' : result.gs1?.found ? 'gs1' : 'manual',
        ...extra,
      })
      toast.success(t('barcodes.import_success'))
      setModal(null)
      // Refresh local result
      const refreshed = await post('/api/barcodes/lookup', { barcode: result.barcode, sources: ['local'] })
      setResult(prev => ({ ...prev, local: refreshed.data.local }))
    } catch { /* toast shown by hook */ }
    finally { setActionBusy(false) }
  }

  const external = result?.opf?.found
    ? result.opf.data
    : result?.gs1?.found
      ? result.gs1.data
      : null

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Input row */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <QrCodeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && lookup()}
              placeholder={t('barcodes.input_placeholder')}
              className="input w-full pl-10 font-mono tracking-wide"
              autoFocus
              autoComplete="off"
            />
            {barcode && (
              <button onClick={reset}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={lookup} disabled={!barcode.trim() || loading}
            className="btn-primary px-5 gap-2 min-w-[96px] justify-center">
            {loading ? <Spin /> : t('barcodes.lookup_btn')}
          </button>
        </div>

        {/* Source checkboxes */}
        <div className="flex flex-wrap gap-4 text-sm">
          {[
            { key: 'local', label: t('barcodes.source_local') },
            { key: 'opf',   label: t('barcodes.source_opf') },
            { key: 'gs1',   label: t('barcodes.source_gs1') },
          ].map(s => (
            <label key={s.key} className="flex items-center gap-1.5 cursor-pointer text-gray-600 dark:text-gray-400 select-none">
              <input type="checkbox" checked={sources[s.key]}
                onChange={e => setSources(prev => ({ ...prev, [s.key]: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600 text-primary-600" />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      {/* Results panel */}
      {result && (
        <div className="space-y-4">

          {/* Barcode info header */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2">
            <div className="font-mono text-lg font-bold text-gray-900 dark:text-white tracking-widest">
              {result.barcode}
            </div>
            <BarcodeInfo format={result.format} validChecksum={result.valid_checksum} length={result.length} />
          </div>

          {/* Invalid checksum warning */}
          {result.is_gtin && result.valid_checksum === false && (
            <div className="flex gap-2 items-start p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-300">
              <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{t('barcodes.checksum_warning')}</span>
            </div>
          )}

          {/* Local result */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              {t('barcodes.local_result')}
            </div>
            {result.local.found ? (
              <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <span className="font-semibold text-green-800 dark:text-green-300">
                    {t('barcodes.found_in_local')}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300 capitalize">
                    {result.local.match_type}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400 text-xs">{t('medicines.name')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{result.local.data.medicine_name}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400 text-xs">SKU</dt>
                    <dd className="font-mono text-xs text-gray-700 dark:text-gray-300">{result.local.data.sku}</dd>
                  </div>
                  {result.local.data.unit_name && (
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400 text-xs">{t('barcodes.unit')}</dt>
                      <dd className="text-gray-700 dark:text-gray-300">{result.local.data.unit_name}</dd>
                    </div>
                  )}
                  {result.local.data.barcode_source && (
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400 text-xs">{t('barcodes.source')}</dt>
                      <dd className="capitalize text-gray-700 dark:text-gray-300">{result.local.data.barcode_source}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <XCircleIcon className="w-4 h-4 flex-shrink-0" />
                {t('barcodes.not_found_local')}
              </div>
            )}
          </div>

          {/* OPF result */}
          {result.opf !== null && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Open Products Facts
              </div>
              {result.opf.found
                ? <ExternalCard data={result.opf.data} />
                : result.opf.error
                  ? <div className="text-sm text-red-500 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">{result.opf.error}</div>
                  : <div className="text-sm text-gray-400 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">{t('barcodes.not_found_external')}</div>
              }
            </div>
          )}

          {/* GS1 result */}
          {result.gs1 !== null && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                GS1 Egypt
              </div>
              {result.gs1.configured === false
                ? <div className="text-sm text-gray-400 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">{t('barcodes.gs1_not_configured')}</div>
                : result.gs1.found
                  ? <ExternalCard data={result.gs1.data} />
                  : <div className="text-sm text-gray-400 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">{t('barcodes.not_found_external')}</div>
              }
            </div>
          )}

          {/* Import actions — only when not in local DB */}
          {!result.local.found && can('barcodes.import') && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t('barcodes.actions')}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setNewName(external?.name || ''); setModal('create') }}
                  className="btn-primary btn-sm gap-1.5">
                  <PlusCircleIcon className="w-4 h-4" />
                  {t('barcodes.action_create')}
                </button>
                <button
                  onClick={() => { setLinkedMed(null); setModal('link_medicine') }}
                  className="btn-secondary btn-sm gap-1.5">
                  <LinkIcon className="w-4 h-4" />
                  {t('barcodes.action_link_medicine')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Create new medicine ── */}
      <Modal open={modal === 'create'} onClose={() => setModal(null)}
        title={t('barcodes.confirm_create_title')} size="md">
        <div className="space-y-4">
          <div className="flex gap-2 items-start p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-800 dark:text-amber-300">
            <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{t('barcodes.confirm_create_note')}</span>
          </div>

          <div>
            <label className="label">{t('medicines.name')} <span className="text-red-500">*</span></label>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder={t('barcodes.name_placeholder')}
              className="input w-full mt-1" autoFocus />
          </div>

          {external && (external.manufacturer || external.quantity) && (
            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              {external.manufacturer && (
                <div><span className="text-gray-400 text-xs">{t('barcodes.manufacturer')}:</span> {external.manufacturer}</div>
              )}
              {external.quantity && (
                <div><span className="text-gray-400 text-xs">{t('barcodes.quantity')}:</span> {external.quantity}</div>
              )}
              <div className="text-xs text-gray-400 mt-1">{t('barcodes.external_data_note')}</div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setModal(null)} className="btn-secondary" disabled={actionBusy}>
              {t('common.cancel')}
            </button>
            <button
              onClick={() => executeImport('create', {
                name:    newName,
                name_ar: external?.name_ar || '',
              })}
              disabled={!newName.trim() || actionBusy}
              className="btn-primary gap-2">
              {actionBusy && <Spin />}
              {t('barcodes.confirm_create_btn')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Link to existing medicine ── */}
      <Modal open={modal === 'link_medicine'} onClose={() => setModal(null)}
        title={t('barcodes.confirm_link_title')} size="md">
        <div className="space-y-4">
          <div className="flex gap-2 items-start p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-800 dark:text-amber-300">
            <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{t('barcodes.confirm_link_note')}</span>
          </div>

          <div>
            <label className="label">{t('barcodes.select_medicine')}</label>
            <div className="mt-1">
              <MedicineSearch onSelect={m => setLinkedMed(m)} />
            </div>
          </div>

          {linkedMed && (
            <div className="text-sm p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl space-y-1">
              <div className="text-blue-800 dark:text-blue-300 font-medium">
                {t('barcodes.will_link_to')}: {linkedMed.name}
              </div>
              <div className="text-xs text-gray-500 font-mono">{linkedMed.sku}</div>
              {linkedMed.barcode && (
                <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  {t('barcodes.medicine_has_barcode')}: <span className="font-mono">{linkedMed.barcode}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setModal(null)} className="btn-secondary" disabled={actionBusy}>
              {t('common.cancel')}
            </button>
            <button
              onClick={() => executeImport('link_medicine', { medicine_id: linkedMed?.id })}
              disabled={!linkedMed || actionBusy}
              className="btn-primary gap-2">
              {actionBusy && <Spin />}
              {t('barcodes.confirm_link_btn')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Tab 2 — CSV Import
// ══════════════════════════════════════════════════════════════
function CsvImportTab({ can }) {
  const { t }             = useTranslation()
  const { post, loading } = useApi()
  const fileRef           = useRef(null)

  const [fileName, setFileName]       = useState('')
  const [preview, setPreview]         = useState(null)
  const [rowActions, setRowActions]   = useState({})
  const [importing, setImporting]     = useState(false)
  const [importResult, setImportResult] = useState(null)

  const getRowAction = (row, idx) => rowActions[idx] ?? row.suggested_action

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    setPreview(null)
    setImportResult(null)
    setRowActions({})
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await post('/api/barcodes/preview', fd)
      setPreview(res.data)
    } catch { /* toast by hook */ }
    e.target.value = ''
  }

  const runImport = async () => {
    if (!preview) return
    setImporting(true)
    try {
      const rows = preview.rows.map((row, idx) => ({
        ...row,
        user_action: getRowAction(row, idx),
      }))
      const res = await post('/api/barcodes/import/csv', { rows })
      setImportResult(res.data)
      toast.success(res.message || t('barcodes.csv_import_done'))
      setPreview(null)
      setFileName('')
    } catch { /* toast by hook */ }
    finally { setImporting(false) }
  }

  const importableCount = preview?.rows.filter((r, i) => getRowAction(r, i) !== 'skip').length || 0

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Format hint */}
      <div className="text-sm bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-1.5">
        <div className="font-medium text-gray-700 dark:text-gray-300">{t('barcodes.csv_format_title')}</div>
        <code className="block text-xs text-gray-500 dark:text-gray-400 font-mono">
          barcode, name, manufacturer, active_ingredient, strength, dosage_form, package_size
        </code>
        <div className="text-xs text-gray-400">{t('barcodes.csv_format_note')}</div>
      </div>

      {/* File picker */}
      <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      <div className="flex items-center gap-3">
        <button onClick={() => fileRef.current?.click()} disabled={loading}
          className="btn-secondary gap-2">
          <ArrowUpTrayIcon className="w-4 h-4" />
          {t('barcodes.select_csv')}
        </button>
        {fileName && (
          <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
            <span className="text-gray-400">·</span>{fileName}
          </span>
        )}
        {loading && <span className="text-sm text-gray-400">{t('common.loading')}</span>}
      </div>

      {/* Preview table */}
      {preview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('barcodes.preview_count', { count: preview.total })}
              <span className="text-gray-400 ml-2">
                — {importableCount} {t('barcodes.will_be_imported')}
              </span>
            </div>
            {can('barcodes.import') && (
              <button onClick={runImport} disabled={importing || importableCount === 0}
                className="btn-primary gap-2">
                {importing ? <><Spin />{t('barcodes.importing')}</> : t('barcodes.import_btn', { count: importableCount })}
              </button>
            )}
          </div>

          <div className="table-container">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th className="text-center w-10">#</th>
                  <th>{t('barcodes.col_barcode')}</th>
                  <th>{t('medicines.name')}</th>
                  <th>{t('barcodes.col_format')}</th>
                  <th>{t('barcodes.col_local_match')}</th>
                  <th>{t('barcodes.col_action')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, idx) => {
                  const action = getRowAction(row, idx)
                  return (
                    <tr key={idx} className={action === 'skip' ? 'opacity-40' : ''}>
                      <td className="text-center text-gray-400 text-xs">{row.row}</td>
                      <td className="font-mono text-xs">
                        {row.barcode || <span className="text-red-400">{t('barcodes.no_barcode')}</span>}
                        {row.valid_checksum === false && row.format !== 'INTERNAL' && row.barcode && (
                          <div className="text-red-400 text-xs">⚠ {t('barcodes.bad_checksum')}</div>
                        )}
                      </td>
                      <td className="max-w-[160px]">
                        <div className="truncate">{row.name || <span className="text-gray-300">—</span>}</div>
                        {row.manufacturer && <div className="text-xs text-gray-400 truncate">{row.manufacturer}</div>}
                      </td>
                      <td>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          {row.format}
                        </span>
                      </td>
                      <td>
                        {row.local_match.found ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[100px]">{row.local_match.data?.medicine_name}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">{t('barcodes.not_found_short')}</span>
                        )}
                      </td>
                      <td className="min-w-[120px]">
                        <select
                          value={action}
                          onChange={e => setRowActions(prev => ({ ...prev, [idx]: e.target.value }))}
                          className="input text-xs py-1 px-2 w-full">
                          <option value="create">{t('barcodes.action_create')}</option>
                          <option value="skip">{t('barcodes.action_skip')}</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import result summary */}
      {importResult && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <div className="font-semibold text-gray-900 dark:text-white">{t('barcodes.import_result')}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              { label: t('barcodes.result_created'), value: importResult.created, color: 'text-green-600 dark:text-green-400' },
              { label: t('barcodes.result_linked'),  value: importResult.linked,  color: 'text-blue-600 dark:text-blue-400' },
              { label: t('barcodes.result_skipped'), value: importResult.skipped, color: 'text-gray-500 dark:text-gray-400' },
              { label: t('barcodes.result_errors'),  value: importResult.errors?.length || 0, color: 'text-red-600 dark:text-red-400' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
          {importResult.errors?.length > 0 && (
            <div className="space-y-1.5 text-sm">
              <div className="font-medium text-red-600 dark:text-red-400">{t('barcodes.result_errors')}:</div>
              {importResult.errors.map((err, i) => (
                <div key={i} className="text-xs text-red-500 font-mono">
                  Row {err.row}: {err.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Tab 3 — Import Logs
// ══════════════════════════════════════════════════════════════
function LogsTab() {
  const { t }             = useTranslation()
  const { get, loading }  = useApi()
  const pg                = usePagination(1, 20)
  const [logs, setLogs]   = useState([])

  useEffect(() => {
    get('/api/barcodes/logs', { page: pg.page, per_page: pg.perPage })
      .then(res => {
        setLogs(res.data || [])
        pg.updateMeta(res.meta)
      })
      .catch(() => {})
  }, [pg.page]) // eslint-disable-line react-hooks/exhaustive-deps

  const STATUS = {
    imported: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    linked:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    skipped:  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    error:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  }

  return (
    <div className="space-y-4">
      {loading && !logs.length
        ? <TableSkeleton rows={5} cols={8} />
        : (
          <div className="table-container">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>{t('barcodes.col_barcode')}</th>
                  <th>{t('barcodes.col_type')}</th>
                  <th>{t('barcodes.col_action')}</th>
                  <th>{t('barcodes.col_source')}</th>
                  <th>{t('barcodes.col_status')}</th>
                  <th>{t('medicines.name')}</th>
                  <th>{t('barcodes.col_user')}</th>
                  <th>{t('common.date')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="font-mono text-xs">{log.barcode}</td>
                    <td className="text-xs capitalize">{log.import_type}</td>
                    <td className="text-xs capitalize">{log.action || '—'}</td>
                    <td>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 capitalize">
                        {log.source}
                      </span>
                    </td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS[log.status] || STATUS.skipped}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="max-w-[140px]">
                      <span className="truncate block">{log.medicine_name || '—'}</span>
                    </td>
                    <td className="text-xs text-gray-500">{log.user_name || '—'}</td>
                    <td className="text-xs text-gray-400 whitespace-nowrap">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </td>
                  </tr>
                ))}
                {!logs.length && !loading && (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-12">
                      {t('barcodes.no_logs')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      }
      <Pagination
        page={pg.page}
        totalPages={pg.totalPages}
        total={pg.total}
        perPage={pg.perPage}
        onPageChange={pg.setPage}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Main page shell
// ══════════════════════════════════════════════════════════════
export default function BarcodeImportPage() {
  const { t }         = useTranslation()
  const { can }       = useAuth()
  const [tab, setTab] = useState('lookup')

  const TABS = [
    { key: 'lookup', label: t('barcodes.tab_lookup'), icon: QrCodeIcon },
    { key: 'csv',    label: t('barcodes.tab_csv'),    icon: ArrowUpTrayIcon },
    { key: 'logs',   label: t('barcodes.tab_logs'),   icon: ClockIcon },
  ]

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('barcodes.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('barcodes.subtitle')}</p>
      </div>

      <div className="card">
        {/* Tab bar */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 -mb-px overflow-x-auto">
          {TABS.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                  tab === item.key
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {tab === 'lookup' && <LookupTab can={can} />}
          {tab === 'csv'    && <CsvImportTab can={can} />}
          {tab === 'logs'   && <LogsTab />}
        </div>
      </div>
    </div>
  )
}

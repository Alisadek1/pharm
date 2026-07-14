import { useState, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export function useApi() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const request = useCallback(async (method, url, data = null, options = {}) => {
    setLoading(true)
    setError(null)
    try {
      const config = { method, url, ...options }
      if (data) {
        if (data instanceof FormData) {
          config.data = data
          config.headers = { 'Content-Type': 'multipart/form-data' }
        } else if (method === 'GET') {
          config.params = data
        } else {
          config.data = data
        }
      }
      const res = await api(config)
      return res.data
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Request failed'
      setError(msg)
      if (!options.silent) toast.error(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const get    = (url, params, opts) => request('GET', url, params, opts)
  const post   = (url, data, opts)   => request('POST', url, data, opts)
  const put    = (url, data, opts)   => request('PUT', url, data, opts)
  const patch  = (url, data, opts)   => request('PATCH', url, data, opts)
  const del    = (url, opts)         => request('DELETE', url, null, opts)

  return { loading, error, get, post, put, patch, del }
}

export function usePagination(initialPage = 1, initialPerPage = 20) {
  const [page, setPage]       = useState(initialPage)
  const [perPage, setPerPage] = useState(initialPerPage)
  const [total, setTotal]     = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const updateMeta = (meta) => {
    if (meta) {
      setTotal(meta.total || 0)
      setTotalPages(meta.total_pages || 0)
    }
  }

  return { page, setPage, perPage, setPerPage, total, totalPages, updateMeta }
}

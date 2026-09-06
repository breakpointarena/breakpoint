'use client'

import { useState, useEffect } from 'react'
import {
  Pencil,
  Trash2,
  Play,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

export interface HappyHourRule {
  id: string
  name: string
  discount: number
  devices: string
  schedule: string
  time_range: string 
  status: 'LIVE' | 'PAUSED' | 'SCHEDULED'
}

interface TableProps {
  data: HappyHourRule[]
  onEdit: (rule: HappyHourRule) => void
  onDelete: (id: string) => void
}

const ITEMS_PER_PAGE = 5

export function HappyHourTable({ data = [], onEdit, onDelete }: TableProps) {
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    setCurrentPage(1)
  }, [data.length])

  const totalPages = Math.max(1, Math.ceil(data.length / ITEMS_PER_PAGE))
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedData = data.slice(startIndex, endIndex)

  const getPageNumbers = () => {
    const pages = []
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages)
      }
    }
    return pages
  }

  // Same palette as the promo code and subscription tables: green for running,
  // amber for waiting to run, muted for switched off.
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'LIVE':
        return 'text-green-400 border-green-500/20 bg-green-500/10'
      case 'SCHEDULED':
        return 'text-amber-400 border-amber-500/20 bg-amber-500/10'
      case 'PAUSED':
      default:
        return 'text-muted-content border-zinc-800 bg-[var(--background)]/80'
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-zinc-900 rounded-xl overflow-hidden flex flex-col shadow-2xl">
      <div className="p-4 bg-[var(--background)]/40 border-b border-zinc-900 font-black text-sm uppercase text-muted-content tracking-wider">
        Active Rules Configuration
      </div>

      {/* RESPONSIVE SCROLLABLE TABLE */}
      <div className="overflow-x-auto min-h-75">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[var(--background)]/20 text-secondary-content font-black uppercase text-xs tracking-wider border-b border-zinc-900 select-none">
            <tr>
              <th className="px-6 py-4">Rule Name</th>
              <th className="px-6 py-4">Discount</th>
              <th className="px-6 py-4">Devices</th>
              <th className="px-6 py-4">Schedule</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/60 font-medium">
            {paginatedData.length > 0 ? (
              paginatedData.map((row) => (
                <tr key={row.id} className="group hover:bg-[var(--background)]/30 transition-colors">
                  {/* RULE NAME */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 font-black text-primary tracking-wide uppercase">
                      <div className={`h-1.5 w-1.5 rounded-full ${row.status === 'LIVE' ? 'bg-green-400' : 'bg-zinc-500'}`}></div>
                      {row.name}
                    </div>
                  </td>

                  {/* DISCOUNT */}
                  <td className="px-6 py-4 text-white font-bold font-mono">
                    {row.discount}% OFF
                  </td>

                  {/* DEVICES */}
                  <td className="px-6 py-4 text-muted-content">
                    {row.devices.includes('PS') ? (
                      <div className="flex gap-1 items-center">
                        <span className="bg-[#27272a] text-sm px-2 py-1 rounded-full text-white">PS</span>
                        <span className="bg-[#27272a] text-sm px-2 py-1 rounded-full text-white">PC</span>
                        <span className="bg-[#27272a] text-sm px-2 py-1 rounded-full text-white">XR</span>
                        <span className="bg-primary/20 text-primary text-sm px-2 py-1 rounded-full border border-primary/30">+12</span>
                      </div>
                    ) : (
                      row.devices
                    )}
                  </td>

                  {/* SCHEDULE & TIME RANGE */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-white font-bold">{row.schedule}</span>
                      {/* Displays the time range immediately below the schedule days */}
                      <span className="text-xs font-mono text-muted-content mt-0.5">{row.time_range}</span>
                    </div>
                  </td>

                  {/* STATUS */}
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 border rounded text-xs font-black tracking-wider uppercase ${getStatusStyle(row.status)}`}>
                      {row.status}
                    </span>
                  </td>

                  {/* ACTIONS */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3 text-muted-content">
                      {row.status === 'PAUSED' && (
                        <button className="hover:text-white transition-colors" title="Resume">
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => onEdit(row)} className="hover:text-white transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => onDelete(row.id)} className="hover:text-red-400 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm font-medium text-muted-content">
                  No active rules found. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION FOOTER */}
      <div className="p-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold uppercase tracking-wider text-muted-content">
        <span>
          Showing <strong className="text-white font-black">{data.length === 0 ? 0 : startIndex + 1}</strong>{' '}
          to <strong className="text-white font-black">{Math.min(endIndex, data.length)}</strong> of{' '}
          <strong className="text-white font-black">{data.length}</strong> rules
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)] hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {getPageNumbers().map((page, index) =>
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="px-1 text-muted-content">
                ..
              </span>
            ) : (
              <button
                key={`page-${page}`}
                onClick={() => setCurrentPage(page as number)}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors font-medium ${
                  currentPage === page
                    ? 'bg-[#27272a] text-white'
                    : 'text-muted-content hover:bg-[var(--surface-hover)] hover:text-white'
                }`}
              >
                {page}
              </button>
            )
          )}

          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || data.length === 0}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)] hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
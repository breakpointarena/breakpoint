'use client'

import { useState, useEffect } from 'react'
import {
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  Clock,
} from 'lucide-react'

interface SubscriptionTableProps {
  data: any[]
  onEdit: (plan: any) => void
  onDelete: (id: string) => void
}

const ITEMS_PER_PAGE = 5

export function SubscriptionTable({ data = [], onEdit, onDelete }: SubscriptionTableProps) {
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

  return (
    <div className="bg-[var(--surface)] border border-zinc-900 rounded-xl overflow-hidden flex flex-col shadow-2xl">
      <div className="p-4 bg-[var(--background)]/40 border-b border-zinc-900 font-black text-sm uppercase text-muted-content tracking-wider">
        Subscription Plan List
      </div>

      <div className="overflow-x-auto min-h-75">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[var(--background)]/20 text-secondary-content font-black uppercase text-xs tracking-wider border-b border-zinc-900 select-none">
            <tr>
              <th className="px-6 py-4">Plan Name</th>
              <th className="px-6 py-4">Duration</th>
              <th className="px-6 py-4">Price</th>
              <th className="px-6 py-4">Discount</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/60 font-medium">
            {paginatedData.length > 0 ? (
              paginatedData.map(row => (
                <tr key={row.id} className="group hover:bg-[var(--background)]/30 transition-colors">
                  {/* NAME & DESC */}
                  <td className="px-6 py-4">
                    <div className="font-black text-primary tracking-wide uppercase">{row.name}</div>
                    <div className="text-xs text-muted-content font-medium mt-0.5 truncate max-w-50">
                      {row.description || 'No description'}
                    </div>
                  </td>

                  {/* DURATION (Fixed to use duration_months) */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-white font-bold">
                      <Clock className="h-3.5 w-3.5 text-muted-content" />
                      {row.duration_months} {row.duration_months === 1 ? 'Month' : 'Months'}
                    </div>
                  </td>

                  {/* PRICE */}
                  <td className="px-6 py-4">
                    <div className="flex items-center text-white font-bold font-mono">
                      <IndianRupee className="h-3.5 w-3.5 text-muted-content mr-0.5" />
                      {Number(row.price).toFixed(2)}
                    </div>
                  </td>

                  {/* DISCOUNT */}
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-black uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 rounded">
                      {row.discount_percentage}% OFF
                    </span>
                  </td>

                  {/* STATUS */}
                  <td className="px-6 py-4">
                    {row.is_active ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-green-400 border border-green-500/20 rounded bg-green-500/10">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-muted-content border border-zinc-800 rounded bg-[var(--background)]/80">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500"></span> Inactive
                      </span>
                    )}
                  </td>

                  {/* ACTIONS */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => onEdit(row)}
                        className="text-muted-content hover:text-primary transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(row.id)}
                        className="text-muted-content hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm font-medium text-muted-content">
                  No subscription plans found. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold uppercase tracking-wider text-muted-content">
        <span>
          Showing <strong className="text-white font-black">{data.length === 0 ? 0 : startIndex + 1}</strong>{' '}
          to <strong className="text-white font-black">{Math.min(endIndex, data.length)}</strong> of{' '}
          <strong className="text-white font-black">{data.length}</strong> plans
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

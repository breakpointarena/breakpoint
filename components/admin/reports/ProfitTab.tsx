'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown, IndianRupee, ReceiptIndianRupee, Percent } from 'lucide-react'
import { getProfitAndLoss } from '@/app/(admin)/admin/reports/actions'
import { toast } from 'sonner'
import { CountUp, CurrencyCountUp } from '@/components/shared/CountUp'

interface ProfitTabProps {
  dateFrom: string
  dateTo: string
}

export function ProfitTab({ dateFrom, dateTo }: ProfitTabProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [dateFrom, dateTo])

  const loadData = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Please select a date range')
      return
    }

    setLoading(true)
    const result = await getProfitAndLoss({ dateFrom, dateTo })
    if (result.success) {
      setData(result.data)
    } else {
      toast.error('Failed to load profit data')
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-secondary-content">Loading profit data...</p>
      </div>
    )
  }

  if (!data) return null

  const isProfit = data.netProfit >= 0
  const isOperationalProfit = data.operationalProfit >= 0

  return (
    <div className="space-y-6">
      {/* Main Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Revenue */}
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/30 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <IndianRupee className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-xs font-black uppercase text-green-400">Revenue</p>
          </div>
          <p className="text-3xl font-black text-white">
            <CurrencyCountUp amount={data.revenue} duration={1500} />
          </p>
          <p className="text-xs text-secondary-content mt-2">
            <CountUp end={data.bookingCount} duration={800} /> completed booking(s)
          </p>
        </Card>

        {/* Expenses */}
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/30 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <ReceiptIndianRupee className="h-5 w-5 text-red-400" />
            </div>
            <p className="text-xs font-black uppercase text-red-400">Expenses</p>
          </div>
          <p className="text-3xl font-black text-white">
            <CurrencyCountUp amount={data.totalExpenses} duration={1400} />
          </p>
          <p className="text-sm-enhanced text-secondary-content mt-2">
            <CountUp end={data.expenseCount} duration={800} /> expense(s)
          </p>
        </Card>

        {/* Net Profit */}
        <Card className={`bg-gradient-to-br ${isProfit ? 'from-primary/10 to-amber-600/5 border-primary/30' : 'from-red-500/10 to-red-600/5 border-red-500/30'} p-6`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-lg ${isProfit ? 'bg-primary/20' : 'bg-red-500/20'} flex items-center justify-center`}>
              {isProfit ? (
                <TrendingUp className="h-5 w-5 text-primary" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-400" />
              )}
            </div>
            <p className={`text-stat-label ${isProfit ? 'text-primary' : 'text-red-400'}`}>
              Net {isProfit ? 'Profit' : 'Loss'}
            </p>
          </div>
          <p className={`text-3xl font-black ${isProfit ? 'text-primary' : 'text-red-400'}`}>
            <CurrencyCountUp amount={Math.abs(data.netProfit)} duration={1600} />
          </p>
          <p className="text-sm-enhanced text-secondary-content mt-2">After all expenses</p>
        </Card>
      </div>

      {/* Expense Breakdown & Operational Profit */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* OpEx */}
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/30 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <ReceiptIndianRupee className="h-5 w-5 text-orange-400" />
            </div>
            <p className="text-stat-label text-orange-400">OpEx</p>
          </div>
          <p className="text-2xl font-black text-white">
            <CurrencyCountUp amount={data.opexExpenses} duration={1200} />
          </p>
          <p className="text-sm-enhanced text-secondary-content mt-2">Operational expenses</p>
        </Card>

        {/* CapEx */}
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/30 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <ReceiptIndianRupee className="h-5 w-5 text-blue-400" />
            </div>
            <p className="text-stat-label text-blue-400">CapEx</p>
          </div>
          <p className="text-2xl font-black text-white">
            <CurrencyCountUp amount={data.capexExpenses} duration={1200} />
          </p>
          <p className="text-sm-enhanced text-secondary-content mt-2">Capital investments</p>
        </Card>

        {/* Operational Profit */}
        <Card className={`bg-gradient-to-br ${isOperationalProfit ? 'from-green-500/10 to-green-600/5 border-green-500/30' : 'from-red-500/10 to-red-600/5 border-red-500/30'} p-6`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-lg ${isOperationalProfit ? 'bg-green-500/20' : 'bg-red-500/20'} flex items-center justify-center`}>
              {isOperationalProfit ? (
                <TrendingUp className="h-5 w-5 text-green-400" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-400" />
              )}
            </div>
            <p className={`text-stat-label ${isOperationalProfit ? 'text-green-400' : 'text-red-400'}`}>
              Op. Profit
            </p>
          </div>
          <p className={`text-2xl font-black ${isOperationalProfit ? 'text-green-400' : 'text-red-400'}`}>
            <CurrencyCountUp amount={Math.abs(data.operationalProfit)} duration={1300} />
          </p>
          <p className="text-sm-enhanced text-secondary-content mt-2">Revenue - OpEx</p>
        </Card>

        {/* Profit Margin */}
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/30 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Percent className="h-5 w-5 text-purple-400" />
            </div>
            <p className="text-stat-label text-purple-400">Margin</p>
          </div>
          <p className="text-2xl font-black text-white">
            <CountUp end={data.profitMargin} duration={1000} decimals={1} suffix="%" />
          </p>
          <p className="text-sm-enhanced text-secondary-content mt-2">Net profit margin</p>
        </Card>
      </div>

      {/* Revenue Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-[var(--surface)] border-[#27272a] p-6">
          <h3 className="text-sm font-black uppercase text-white mb-4 flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-primary to-primary rounded-full" />
            Revenue Breakdown
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs text-secondary-content">Device Bookings</p>
                <p className="text-sm font-black text-white">
                  <CurrencyCountUp amount={data.deviceRevenue} duration={1100} />
                </p>
              </div>
              <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary transition-all duration-[1500ms] ease-out"
                  style={{ width: `${data.revenue > 0 ? (data.deviceRevenue / data.revenue) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs text-secondary-content">Food Sales</p>
                <p className="text-sm font-black text-white">
                  <CurrencyCountUp amount={data.foodRevenue} duration={1100} />
                </p>
              </div>
              <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-[1500ms] ease-out"
                  style={{ width: `${data.revenue > 0 ? (data.foodRevenue / data.revenue) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-zinc-800">
              <div className="flex justify-between items-center">
                <p className="text-xs font-black text-primary uppercase">Total Revenue</p>
                <p className="text-lg font-black text-primary">
                  <CurrencyCountUp amount={data.revenue} duration={1300} />
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Profit Chart Placeholder */}
        <Card className="bg-[var(--surface)] border-[#27272a] p-6">
          <h3 className="text-sm font-black uppercase text-white mb-4 flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-green-500 to-red-500 rounded-full" />
            Profit Overview
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <span className="text-xs text-muted-content">Revenue</span>
              <span className="text-sm font-black text-green-400">
                <CurrencyCountUp amount={data.revenue} duration={1100} />
              </span>
            </div>
            <div className="flex items-center justify-center py-2">
              <span className="text-2xl font-black text-muted-content">−</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <span className="text-xs text-muted-content">Expenses</span>
              <span className="text-sm font-black text-red-400">
                <CurrencyCountUp amount={data.totalExpenses} duration={1100} />
              </span>
            </div>
            <div className="flex items-center justify-center py-2">
              <span className="text-2xl font-black text-muted-content">=</span>
            </div>
            <div className={`flex items-center justify-between p-4 ${isProfit ? 'bg-primary/10 border-primary/20' : 'bg-red-500/10 border-red-500/20'} border rounded-lg`}>
              <span className={`text-sm font-black uppercase ${isProfit ? 'text-primary' : 'text-red-400'}`}>
                {isProfit ? 'Profit' : 'Loss'}
              </span>
              <span className={`text-xl font-black ${isProfit ? 'text-primary' : 'text-red-400'}`}>
                <CurrencyCountUp amount={Math.abs(data.profit)} duration={1400} />
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Insights */}
      <Card className="bg-gradient-to-br from-[#111] via-zinc-950 to-[#111] border-primary/20 p-6">
        <h3 className="text-sm font-black uppercase text-white mb-4">Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-secondary-content mb-1">Average Revenue per Booking</p>
            <p className="text-xl font-black text-white">
              <CurrencyCountUp
                amount={data.bookingCount > 0 ? data.revenue / data.bookingCount : 0}
                duration={1000}
              />
            </p>
          </div>
          <div>
            <p className="text-xs text-secondary-content mb-1">Device Revenue %</p>
            <p className="text-xl font-black text-white">
              <CountUp
                end={data.revenue > 0 ? (data.deviceRevenue / data.revenue) * 100 : 0}
                duration={1000}
                decimals={1}
                suffix="%"
              />
            </p>
          </div>
          <div>
            <p className="text-xs text-secondary-content mb-1">Food Revenue %</p>
            <p className="text-xl font-black text-white">
              <CountUp
                end={data.revenue > 0 ? (data.foodRevenue / data.revenue) * 100 : 0}
                duration={1000}
                decimals={1}
                suffix="%"
              />
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

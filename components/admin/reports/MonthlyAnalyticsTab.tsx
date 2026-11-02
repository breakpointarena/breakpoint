"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarRange, IndianRupee, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { getMonthlyRevenueReports } from "@/app/(admin)/admin/reports/actions";
import { toast } from "sonner";

type MonthRevenue = {
  month: string;
  label: string;
  year: number;
  totalRevenue: number;
  deviceRevenue: number;
  foodRevenue: number;
  walletRevenue: number;
};

type MonthlyReport = {
  months: MonthRevenue[];
  currentMonth: string;
  currentMonthDays: number;
  changePercent: number | null;
  currentToDate: number;
  previousToDate: number;
  previousMonth: string;
  totalRevenue: number;
  fromMonth: string;
  toMonth: string;
  isCurrentMonth: boolean;
};

const SERIES = [
  { key: "deviceRevenue", label: "Devices", color: "bg-primary" },
  { key: "foodRevenue", label: "Food", color: "bg-amber-400" },
  { key: "walletRevenue", label: "Wallet top-ups", color: "bg-sky-400" },
] as const;

export function MonthlyAnalyticsTab({ report: initialReport }: { report: MonthlyReport }) {
  const [report, setReport] = useState(initialReport);
  const [fromMonth, setFromMonth] = useState(initialReport.fromMonth);
  const [toMonth, setToMonth] = useState(initialReport.toMonth);
  const [selectedMonth, setSelectedMonth] = useState(initialReport.currentMonth);
  const [loading, setLoading] = useState(false);
  const maxRevenue = Math.max(1, ...report.months.map((month) => month.totalRevenue));
  const selected = report.months.find((month) => month.month === selectedMonth) ?? report.months.at(-1)!;
  const bestMonth = useMemo(
    () => report.months.reduce((best, month) => month.totalRevenue > best.totalRevenue ? month : best, report.months[0]),
    [report.months]
  );
  const change = report.changePercent;
  const ChangeIcon = change !== null && change < 0 ? ArrowDownRight : ArrowUpRight;

  const applyRange = async () => {
    if (!fromMonth || !toMonth || fromMonth > toMonth) {
      toast.error("Choose a valid month range");
      return;
    }
    setLoading(true);
    try {
      const result = await getMonthlyRevenueReports(fromMonth, toMonth);
      if (!result.success) {
        toast.error("Could not load monthly analytics", { description: result.error });
        return;
      }
      setReport(result as MonthlyReport);
      setSelectedMonth((result as MonthlyReport).currentMonth);
    } catch {
      toast.error("Could not load monthly analytics");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black uppercase tracking-wide text-white">Monthly Analytics</h2>
        <p className="mt-1 text-sm text-secondary-content">Choose a month range to explore collected revenue.</p>
      </div>

      <Card className="flex flex-col gap-3 border-[#27272a] bg-[var(--surface)] p-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-2 text-xs font-bold uppercase tracking-wider text-muted-content">
          From month
          <input type="month" value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} className="h-11 rounded-lg border border-zinc-800 bg-[var(--background)] px-3 text-sm font-semibold text-white" />
        </label>
        <label className="flex flex-1 flex-col gap-2 text-xs font-bold uppercase tracking-wider text-muted-content">
          To month
          <input type="month" value={toMonth} onChange={(event) => setToMonth(event.target.value)} className="h-11 rounded-lg border border-zinc-800 bg-[var(--background)] px-3 text-sm font-semibold text-white" />
        </label>
        <Button onClick={applyRange} disabled={loading || !fromMonth || !toMonth || fromMonth > toMonth} className="h-11 font-bold uppercase">
          {loading ? "Loading…" : "Apply range"}
        </Button>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-[#27272a] bg-[var(--surface)] p-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-content">
            <IndianRupee className="h-4 w-4 text-primary" /> Revenue · {report.fromMonth} to {report.toMonth}
          </div>
          <p className="mt-3 text-2xl font-black text-white">₹{formatCurrency(report.totalRevenue)}</p>
        </Card>
        <Card className="border-[#27272a] bg-[var(--surface)] p-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-content">
            <CalendarRange className="h-4 w-4 text-primary" /> End month revenue
          </div>
          <p className="mt-3 text-2xl font-black text-white">₹{formatCurrency(report.currentToDate)}</p>
            <p className="mt-1 text-xs text-muted-content">{report.isCurrentMonth ? `Through day ${report.currentMonthDays}` : "Selected end month"}</p>
        </Card>
        <Card className="border-[#27272a] bg-[var(--surface)] p-5 sm:col-span-2 xl:col-span-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-content">
            <TrendingUp className="h-4 w-4 text-primary" /> {report.isCurrentMonth ? "Change vs same dates last month" : "Change vs previous month"}
          </div>
          {change === null ? (
            <p className="mt-3 text-sm font-semibold text-secondary-content">Not enough previous month revenue to compare.</p>
          ) : (
            <p className={`mt-3 flex items-center gap-1 text-2xl font-black ${change < 0 ? "text-rose-400" : "text-emerald-400"}`}>
              <ChangeIcon className="h-6 w-6" /> {Math.abs(change).toFixed(1)}%
            </p>
          )}
            <p className="mt-1 text-xs text-muted-content">₹{formatCurrency(report.previousToDate)} in the comparable period</p>
        </Card>
      </div>

      <Card className="border-[#27272a] bg-[var(--surface)] p-5 sm:p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-black uppercase tracking-wide text-white">Revenue by Month</h3>
            <p className="mt-1 text-xs text-muted-content">Select a bar to inspect its breakdown. {report.isCurrentMonth ? "Current month is month-to-date." : "The selected end month is complete."}</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {SERIES.map((series) => (
              <span key={series.key} className="flex items-center gap-2 text-xs text-secondary-content">
                <span className={`h-2.5 w-2.5 rounded-sm ${series.color}`} /> {series.label}
              </span>
            ))}
            {report.months.some((month) => month.totalRevenue > month.deviceRevenue + month.foodRevenue + month.walletRevenue) && (
              <span className="flex items-center gap-2 text-xs text-secondary-content">
                <span className="h-2.5 w-2.5 rounded-sm bg-zinc-400" /> Other
              </span>
            )}
          </div>
        </div>

        <div className="flex h-64 items-end gap-2 overflow-x-auto border-b border-zinc-800 pb-2 sm:gap-3">
          {report.months.map((month) => {
            const isSelected = month.month === selected.month;
            const totalHeight = month.totalRevenue ? Math.max(3, (month.totalRevenue / maxRevenue) * 100) : 0;
            return (
              <button
                type="button"
                key={month.month}
                onClick={() => setSelectedMonth(month.month)}
                aria-label={`${month.label} ${month.year}: ₹${formatCurrency(month.totalRevenue)}`}
                aria-pressed={isSelected}
                className={`group flex h-full min-w-[52px] flex-1 flex-col items-center justify-end gap-2 rounded-md px-1 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary ${isSelected ? "bg-white/5" : ""}`}
              >
                <span className="text-[10px] font-bold text-secondary-content opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {month.totalRevenue ? `₹${formatCurrency(month.totalRevenue)}` : "₹0"}
                </span>
                <span className="flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: `${totalHeight}%` }}>
                  {month.walletRevenue > 0 && <span className="min-h-[2px] bg-sky-400" style={{ height: `${(month.walletRevenue / month.totalRevenue) * 100}%` }} />}
                  {month.foodRevenue > 0 && <span className="min-h-[2px] bg-amber-400" style={{ height: `${(month.foodRevenue / month.totalRevenue) * 100}%` }} />}
                  {month.deviceRevenue > 0 && <span className="min-h-[2px] bg-primary" style={{ height: `${(month.deviceRevenue / month.totalRevenue) * 100}%` }} />}
                  {month.totalRevenue > month.deviceRevenue + month.foodRevenue + month.walletRevenue && (
                    <span className="min-h-[2px] bg-zinc-400" style={{ height: `${((month.totalRevenue - month.deviceRevenue - month.foodRevenue - month.walletRevenue) / month.totalRevenue) * 100}%` }} />
                  )}
                </span>
                <span className={`whitespace-nowrap text-[10px] font-bold ${isSelected ? "text-primary" : "text-muted-content"}`}>
                  {month.label} <span className="hidden sm:inline">{String(month.year).slice(-2)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-content">{selected.label} {selected.year}{selected.month === report.currentMonth && report.isCurrentMonth ? " · month to date" : ""}</p>
            <p className="mt-1 text-3xl font-black text-white">₹{formatCurrency(selected.totalRevenue)}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-secondary-content">
              <span>Devices <strong className="ml-1 text-white">₹{formatCurrency(selected.deviceRevenue)}</strong></span>
              <span>Food <strong className="ml-1 text-white">₹{formatCurrency(selected.foodRevenue)}</strong></span>
              <span>Wallet <strong className="ml-1 text-white">₹{formatCurrency(selected.walletRevenue)}</strong></span>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 px-4 py-3 md:text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-content">Best month</p>
            <p className="mt-1 font-black text-white">{bestMonth.label} {bestMonth.year}</p>
            <p className="text-sm font-bold text-primary">₹{formatCurrency(bestMonth.totalRevenue)}</p>
          </div>
        </div>
        <p className="mt-5 text-[11px] text-muted-content">Revenue is grouped by payment date. Cancelled bookings are excluded. Wallet top-ups are shown separately.</p>
      </Card>
    </div>
  );
}

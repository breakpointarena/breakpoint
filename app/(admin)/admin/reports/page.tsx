"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  IndianRupee, TrendingUp, ShoppingBag, Gamepad2,
  UtensilsCrossed, BarChart3, CalendarDays, ReceiptIndianRupee, ShieldAlert
, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  getDashboardSummary,
  getFoodReports,
  getDeviceReports,
  getRevenueReports,
  type ReportFilters
} from "./actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ExpensesTab } from "@/components/admin/reports/ExpensesTab";
import { ProfitTab } from "@/components/admin/reports/ProfitTab";
import { CountUp, CurrencyCountUp } from "@/components/shared/CountUp";
import { roundToTwo, formatCurrency } from "@/lib/currency";
import { checkReportsAccess } from "@/lib/auth/roles";
import {
  formatLocalDate,
  parseLocalDate,
  startOfLocalDay,
  validateReportDateRange
} from "@/lib/utils/dates";

export default function AdminReportsPage() {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "food" | "device" | "revenue" | "expenses" | "profit">("overview");
  const [loading, setLoading] = useState(true);

  // Initialize with current month dates
  const getLocalDateString = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const initializeCurrentMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      from: getLocalDateString(firstDay),
      to: getLocalDateString(lastDay)
    };
  };

  const currentMonth = initializeCurrentMonth();
  const [dateFrom, setDateFrom] = useState(currentMonth.from);
  const [dateTo, setDateTo] = useState(currentMonth.to);
  const [activeQuickFilter, setActiveQuickFilter] = useState<string>("month");

  // --- Date range validation -------------------------------------------------
  // Recomputed every render so the pickers stay in step with each other: the
  // bounds of one are always derived from the current value of the other.
  const today = startOfLocalDay(new Date());
  const fromDate = dateFrom ? parseLocalDate(dateFrom) : null;
  const toDate = dateTo ? parseLocalDate(dateTo) : null;
  const dateRangeError = validateReportDateRange(dateFrom, dateTo);

  // From Date runs up to the chosen To Date, and is unbounded without one
  const isFromDateDisabled = (day: Date) => {
    const candidate = startOfLocalDay(day);
    return !!toDate && candidate > toDate;
  };

  // To Date starts at the chosen From Date, and is unbounded without one
  const isToDateDisabled = (day: Date) => {
    const candidate = startOfLocalDay(day);
    return !!fromDate && candidate < fromDate;
  };

  const handleSelectFromDate = (date?: Date) => {
    if (!date) return;
    const next = formatLocalDate(date);
    setDateFrom(next);
    // Belt and braces: the picker disables these days, but a preset or a stale
    // popover must not be able to leave the range inverted.
    if (dateTo && next > dateTo) setDateTo(next);
  };

  const handleSelectToDate = (date?: Date) => {
    if (!date) return;
    const next = formatLocalDate(date);
    setDateTo(next);
    if (dateFrom && next < dateFrom) setDateFrom(next);
  };

  // Overview data
  const [overviewData, setOverviewData] = useState<any>(null);

  // Food data
  const [foodData, setFoodData] = useState<any>(null);

  // Device data
  const [deviceData, setDeviceData] = useState<any>(null);

  // Revenue data
  const [revenueData, setRevenueData] = useState<any>(null);

  // Check access on mount
  useEffect(() => {
    checkReportsAccess().then((access) => {
      setHasAccess(access);
      if (!access) {
        toast.error("Access Denied", {
          description: "You don't have permission to view reports. Redirecting...",
          icon: <ShieldAlert className="h-5 w-5" />,
        });
        setTimeout(() => {
          router.push("/admin/dashboard");
        }, 2000);
      }
    });
  }, [router]);

  /**
   * One effect for every input the report query actually depends on.
   *
   * The date range used to drive a second effect of its own, so opening this
   * page ran the whole report twice - once because the tab resolved and once
   * because the range did. That second effect also had no access check, so a
   * staff account without reports access issued a query it was never allowed
   * to read on its way to being redirected.
   */
  useEffect(() => {
    if (!hasAccess) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, hasAccess, dateFrom, dateTo]);

  const loadData = async () => {
    // Never query on a range the user has been told is invalid
    if (dateRangeError) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const filters: ReportFilters = {};
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    try {
      if (activeTab === "overview") {
        const result = await getDashboardSummary(filters);
        if (result.success) {
          setOverviewData(result.summary);
        }
      } else if (activeTab === "food") {
        const result = await getFoodReports(filters);
        if (result.success) {
          setFoodData(result);
        }
      } else if (activeTab === "device") {
        const result = await getDeviceReports(filters);
        if (result.success) {
          setDeviceData(result);
        }
      } else if (activeTab === "revenue") {
        const result = await getRevenueReports(filters);
        if (result.success) {
          setRevenueData(result);
        }
      }
    } catch (err) {
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    if (dateRangeError) {
      toast.error("Invalid date range", { description: dateRangeError });
      return;
    }
    loadData();
  };

  const setQuickDateRange = (preset: "today" | "7days" | "30days" | "month" | "90days" | "all") => {
    const today = new Date();
    const todayStr = getLocalDateString(today);

    setActiveQuickFilter(preset);

    switch (preset) {
      case "today":
        setDateFrom(todayStr);
        setDateTo(todayStr);
        break;
      case "7days":
        const week = new Date(today);
        week.setDate(week.getDate() - 7);
        setDateFrom(getLocalDateString(week));
        setDateTo(todayStr);
        break;
      case "30days":
        const month = new Date(today);
        month.setDate(month.getDate() - 30);
        setDateFrom(getLocalDateString(month));
        setDateTo(todayStr);
        break;
      case "month":
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        setDateFrom(getLocalDateString(firstDay));
        setDateTo(getLocalDateString(lastDay));
        break;
      case "90days":
        const quarter = new Date(today);
        quarter.setDate(quarter.getDate() - 90);
        setDateFrom(getLocalDateString(quarter));
        setDateTo(todayStr);
        break;
      case "all":
        setDateFrom("");
        setDateTo("");
        break;
    }
  };

  const handleQuickDateFilter = (days: number | "today" | "month" | "all") => {
    const today = new Date();
    const todayStr = getLocalDateString(today);

    if (days === "today") {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (days === "month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setDateFrom(getLocalDateString(firstDay));
      setDateTo(getLocalDateString(lastDay));
    } else if (days === "all") {
      setDateFrom("");
      setDateTo("");
    } else {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      setDateFrom(getLocalDateString(fromDate));
      setDateTo(todayStr);
    }
  };


  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "profit", label: "Profit & Loss", icon: TrendingUp },
    { id: "food", label: "Food Reports", icon: UtensilsCrossed },
    { id: "device", label: "Device Reports", icon: Gamepad2 },
    { id: "revenue", label: "Revenue Reports", icon: IndianRupee },
    // Receipt draws a dollar sign inside the receipt outline; the rupee variant
    // is the same outline with ₹ in it.
    { id: "expenses", label: "Expenses", icon: ReceiptIndianRupee }
  ];

  // Show loading while checking access
  if (hasAccess === null) {
    return (
      <div className="h-screen flex items-center justify-center">
        <BreakpointLoader size="lg" text="Checking permissions..." />
      </div>
    );
  }

  // Show access denied if user is staff
  if (!hasAccess) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="bg-[var(--surface)] border-red-500/20 p-12 max-w-md text-center">
          <div className="space-y-4">
            <ShieldAlert className="h-16 w-16 text-red-500 mx-auto" />
            <h2 className="text-2xl font-black text-white uppercase">Access Denied</h2>
            <p className="text-secondary-content">
              You don't have permission to view reports. Only admins can access this page.
            </p>
            <Button
              onClick={() => router.push("/admin/dashboard")}
              className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase"
            >
              Go to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase text-white tracking-tight">
            REPORTS & ANALYTICS
          </h1>
          <p className="text-sm text-secondary-content font-medium mt-1">
            Track performance and insights across all operations
          </p>
        </div>
      </div>

      {/* Date Filters */}
      <Card className="bg-[var(--surface)] border-[#27272a] p-4 space-y-4">
        {/* Quick Filter Buttons */}
        <div>
          <Label className="text-label text-muted-content mb-2 block">
            Quick Filters
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuickDateRange("today")}
              className={`w-full md:w-auto font-bold uppercase text-xs h-9 ${
                activeQuickFilter === "today"
                  ? "bg-primary text-white border-primary glow-box-hover scale-[1.02] hover:bg-primary hover:text-white hover:scale-[1.02]"
                  : "text-primary"
              }`}
            >
              Today
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuickDateRange("7days")}
              className={`w-full md:w-auto font-bold uppercase text-xs h-9 ${
                activeQuickFilter === "7days"
                  ? "bg-primary text-white border-primary glow-box-hover scale-[1.02] hover:bg-primary hover:text-white hover:scale-[1.02]"
                  : "text-primary"
              }`}
            >
              Last 7 Days
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuickDateRange("30days")}
              className={`w-full md:w-auto font-bold uppercase text-xs h-9 ${
                activeQuickFilter === "30days"
                  ? "bg-primary text-white border-primary glow-box-hover scale-[1.02] hover:bg-primary hover:text-white hover:scale-[1.02]"
                  : "text-primary"
              }`}
            >
              Last 30 Days
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuickDateRange("month")}
              className={`w-full md:w-auto font-bold uppercase text-xs h-9 ${
                activeQuickFilter === "month"
                  ? "bg-primary text-white border-primary glow-box-hover scale-[1.02] hover:bg-primary hover:text-white hover:scale-[1.02]"
                  : "text-primary"
              }`}
            >
              This Month
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuickDateRange("90days")}
              className={`w-full md:w-auto font-bold uppercase text-xs h-9 ${
                activeQuickFilter === "90days"
                  ? "bg-primary text-white border-primary glow-box-hover scale-[1.02] hover:bg-primary hover:text-white hover:scale-[1.02]"
                  : "text-primary"
              }`}
            >
              Last 90 Days
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuickDateRange("all")}
              className={`w-full md:w-auto font-bold uppercase text-xs h-9 ${
                activeQuickFilter === "all"
                  ? "bg-primary text-white border-primary glow-box-hover scale-[1.02] hover:bg-primary hover:text-white hover:scale-[1.02]"
                  : "text-primary"
              }`}
            >
              All Time
            </Button>
          </div>
        </div>

        {/* Custom Date Range */}
        <div className="flex flex-col md:flex-row gap-4 items-end mt-2">

          {/* Date Pickers Container: 2 columns on mobile */}
          <div className="flex-1 grid grid-cols-2 gap-3 w-full">
            {/* FROM DATE POP-OVER */}
            <div className="space-y-2 w-full">
              <Label className="text-label text-muted-content ml-2 flex items-center gap-1.5">
                From Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full bg-[var(--background)] border border-zinc-900 h-12 rounded-xl px-3 sm:px-4 text-xs font-mono font-bold text-left flex items-center justify-between transition-all hover:border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-primary overflow-hidden"
                  >
                    <span className="truncate mr-2">{dateFrom ? format(new Date(dateFrom), "dd-MM-yyyy") : <span className="text-muted-content">dd-mm-yyyy</span>}</span>
                    <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-[var(--background)] border border-zinc-800 rounded-xl shadow-2xl" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate ?? undefined}
                    onSelect={handleSelectFromDate}
                    disabled={isFromDateDisabled}
                    defaultMonth={fromDate ?? toDate ?? today}
                    endMonth={toDate ?? undefined}
                    className="text-white"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* TO DATE POP-OVER */}
            <div className="space-y-2 w-full">
              <Label className="text-label text-muted-content ml-2 flex items-center gap-1.5">
                To Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full bg-[var(--background)] border border-zinc-900 h-12 rounded-xl px-3 sm:px-4 text-xs font-mono font-bold text-left flex items-center justify-between transition-all hover:border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-primary overflow-hidden"
                  >
                    <span className="truncate mr-2">{dateTo ? format(new Date(dateTo), "dd-MM-yyyy") : <span className="text-muted-content">dd-mm-yyyy</span>}</span>
                    <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-[var(--background)] border border-zinc-800 rounded-xl shadow-2xl" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate ?? undefined}
                    onSelect={handleSelectToDate}
                    disabled={isToDateDisabled}
                    defaultMonth={toDate ?? today}
                    startMonth={fromDate ?? undefined}
                    className="text-white "
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Action Buttons Container: 2 columns on mobile, flex on desktop */}
          <div className="grid grid-cols-2 gap-3 w-full md:w-auto md:flex md:gap-4">
            <Button
              onClick={handleApplyFilters}
              disabled={!!dateRangeError}
              className="w-full md:w-auto bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase text-xs h-11 rounded-xl px-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply Range
            </Button>
            <Button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                handleApplyFilters();
              }}
              variant="outline"
              className="w-full md:w-auto font-bold uppercase text-xs h-11 rounded-xl px-6"
            >
              Clear Filters
            </Button>
          </div>

        </div>

        {/* Validation message - the pickers disable these days, so this only
            shows if a range was set some other way */}
        {dateRangeError && (
          <p
            role="alert"
            className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
          >
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            {dateRangeError}
          </p>
        )}
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#27272a] overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === tab.id
                ? "text-primary border-b-2 border-primary"
                : "text-secondary-content hover:text-zinc-300"
                }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <BreakpointLoader size="lg" />
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === "overview" && overviewData && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-green-500/70 mb-1">
                        Total Revenue
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CurrencyCountUp amount={overviewData.totalRevenue} duration={1500} />
                      </h3>
                    </div>
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <IndianRupee className="h-5 w-5 text-green-500" />
                    </div>
                  </div>
                </Card>

                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-blue-500/70 mb-1">
                        Device Revenue
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CurrencyCountUp amount={overviewData.deviceRevenue} duration={1300} />
                      </h3>
                    </div>
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Gamepad2 className="h-5 w-5 text-blue-500" />
                    </div>
                  </div>
                </Card>

                <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-amber-500/70 mb-1">
                        Food Revenue
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CurrencyCountUp amount={overviewData.foodRevenue} duration={1300} />
                      </h3>
                    </div>
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                      <UtensilsCrossed className="h-5 w-5 text-amber-500" />
                    </div>
                  </div>
                </Card>

                <Card className="bg-gradient-to-br from-amber-500/10 to-orange-600/5 border-amber-500/20 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-amber-500/70 mb-1">
                        Total Bookings
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CountUp end={overviewData.totalBookings} duration={1000} />
                      </h3>
                    </div>
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                      <CalendarDays className="h-5 w-5 text-amber-500" />
                    </div>
                  </div>
                </Card>
              </div>

              {/* Additional Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-[var(--surface)] hover:border-primary border-1 p-5 hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-label text-muted-content">
                      Food Orders
                    </p>
                    <ShoppingBag className="h-4 w-4 text-muted-content" />
                  </div>
                  <h4 className="text-xl font-black text-primary">
                    <CountUp end={overviewData.totalFoodOrders} duration={900} />
                  </h4>
                  <p className="text-xs text-data-placeholder mt-1">
                    <CountUp end={overviewData.totalItemsSold} duration={1000} /> items sold
                  </p>
                </Card>

                <Card className="bg-[var(--surface)] p-5 hover:border-primary border-1 hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-label text-muted-content">
                      Hours Booked
                    </p>
                    <CalendarDays className="h-4 w-4 text-muted-content" />
                  </div>
                  <h4 className="text-xl font-black text-primary">
                    <CountUp end={overviewData.totalHoursBooked} duration={1000} decimals={1} />
                  </h4>
                  <p className="text-min-enhanced text-secondary-content mt-1">
                    Total gaming hours
                  </p>
                </Card>

                <Card className="bg-[var(--surface)] hover:border-primary border-1 p-5 hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-label text-muted-content">
                      Avg Revenue
                    </p>
                    <TrendingUp className="h-4 w-4 text-muted-content" />
                  </div>
                  <h4 className="text-xl font-black text-primary">
                    <CurrencyCountUp amount={overviewData.totalRevenue / (overviewData.totalBookings || 1)} duration={1100} />
                  </h4>
                  <p className="text-xs text-data-placeholder mt-1">
                    Per booking
                  </p>
                </Card>

                {/* None of the takings above include these. The amount is what was
                    collected before the booking was called off - money the arena is
                    holding for a session nobody played. */}
                <Card className="bg-[var(--surface)] hover:border-red-500/50 border-1 p-5 hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-label text-muted-content">
                      Cancelled
                    </p>
                    <Ban className="h-4 w-4 text-muted-content" />
                  </div>
                  <h4 className="text-xl font-black text-red-400">
                    <CountUp end={overviewData.cancelledBookings || 0} duration={900} />
                  </h4>
                  <p className="text-xs text-data-placeholder mt-1">
                    {Number(overviewData.cancelledAwaitingRefund || 0) > 0 ? (
                      <>
                        ₹{formatCurrency(overviewData.cancelledAwaitingRefund)} still to refund
                      </>
                    ) : Number(overviewData.cancelledCollected || 0) > 0 ? (
                      <>
                        ₹{formatCurrency(overviewData.cancelledCollected)} refunded in full
                      </>
                    ) : (
                      'Bookings called off, nothing collected'
                    )}
                  </p>
                </Card>
              </div>
            </div>
          )}

          {/* Food Reports Tab */}
          {activeTab === "food" && foodData && (
            <div className="space-y-6">
              {/* Food Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-amber-500/10 to-orange-600/5 border-amber-500/20 p-6 hover:-translate-y-1 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-amber-500/70 mb-2">
                        Total Revenue
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CurrencyCountUp amount={foodData.summary.totalRevenue} duration={1300} />
                      </h3>
                    </div>
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                      <IndianRupee className="h-5 w-5 text-amber-500" />
                    </div>
                  </div>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 p-6 hover:-translate-y-1 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-green-500/70 mb-2">
                        Items Sold
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CountUp end={foodData.summary.totalItemsSold} duration={1000} />
                      </h3>
                    </div>
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <ShoppingBag className="h-5 w-5 text-green-500" />
                    </div>
                  </div>
                </Card>
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 p-6 hover:-translate-y-1 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-blue-500/70 mb-2">
                        Total Orders
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CountUp end={foodData.summary.totalOrders} duration={1000} />
                      </h3>
                    </div>
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <ReceiptIndianRupee className="h-5 w-5 text-blue-500" />
                    </div>
                  </div>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 p-6 hover:-translate-y-1 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-purple-500/70 mb-2">
                        Avg Order Value
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CurrencyCountUp amount={foodData.summary.averageOrderValue} duration={1100} />
                      </h3>
                    </div>
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-purple-500" />
                    </div>
                  </div>
                </Card>
              </div>

              {/* Category Breakdown */}
              <Card className="bg-[var(--surface)] border-[#27272a] p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <UtensilsCrossed className="h-5 w-5 text-amber-500" />
                  </div>
                  <h3 className="text-sm font-black uppercase text-white">
                    Category Breakdown
                  </h3>
                </div>
                <div className="space-y-3">
                  {foodData.categoryBreakdown.map((category: any, index: number) => {
                    const colors = [
                      { bg: 'from-amber-500/10 to-orange-500/5', border: 'border-amber-500/20', text: 'text-amber-400' },
                      { bg: 'from-green-500/10 to-emerald-500/5', border: 'border-green-500/20', text: 'text-green-400' },
                      { bg: 'from-blue-500/10 to-cyan-500/5', border: 'border-blue-500/20', text: 'text-blue-400' },
                      { bg: 'from-purple-500/10 to-pink-500/5', border: 'border-purple-500/20', text: 'text-purple-400' },
                    ];
                    const color = colors[index % colors.length];
                    return (
                      <div
                        key={category.category}
                        className={`flex items-center justify-between p-4 bg-gradient-to-r ${color.bg} border ${color.border} rounded-xl hover:scale-[1.02] transition-all`}
                      >
                        <div>
                          <p className={`text-sm font-black ${color.text}`}>
                            {category.category}
                          </p>
                          <p className="text-xs text-secondary-content mt-1">
                            <CountUp end={category.totalQuantity} duration={800} /> items • <CountUp end={category.itemCount} duration={800} /> unique
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-white">
                            <CurrencyCountUp amount={category.totalRevenue} duration={1100} />
                          </p>
                          <p className="text-xs text-secondary-content uppercase mt-1">
                            <CountUp end={(category.totalRevenue / foodData.summary.totalRevenue) * 100} duration={900} decimals={1} suffix="% of total" />
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Top Items */}
              <Card className="bg-[var(--surface)] border-[#27272a] p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-black uppercase text-white">
                    Top Selling Items
                  </h3>
                </div>
                <div className="space-y-3">
                  {foodData.topItems.map((item: any, idx: number) => {
                    const rankColors = [
                      'bg-gradient-to-br from-yellow-500 to-yellow-600 text-yellow-900',
                      'bg-gradient-to-br from-zinc-300 to-zinc-400 text-zinc-900',
                      'bg-gradient-to-br from-amber-600 to-amber-700 text-amber-950',
                      'bg-gradient-to-br from-primary to-primary/80 text-white'
                    ];
                    const rankColor = idx < 3 ? rankColors[idx] : rankColors[3];

                    return (
                      <div
                        key={item.itemName}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-[var(--background)] to-[var(--background)]/50 border border-zinc-800 rounded-xl hover:border-primary/30 hover:scale-[1.01] transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl ${rankColor} flex items-center justify-center text-sm font-black shadow-lg`}>
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-sm font-black text-white">{item.itemName}</p>
                            <p className="text-xs text-secondary-content mt-1">
                              {item.category} • <CountUp end={item.totalQuantity} duration={800} /> sold
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-primary">
                            <CurrencyCountUp amount={item.totalRevenue} duration={1000} />
                          </p>
                          <p className="text-xs text-secondary-content uppercase mt-1">
                            <CountUp end={item.orderCount} duration={800} /> orders
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* Device Reports Tab */}
          {activeTab === "device" && deviceData && (
            <div className="space-y-6">
              {/* Device Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-600/5 border-blue-500/20 p-6 hover:-translate-y-1 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-blue-500/70 mb-2">
                        Total Revenue
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CurrencyCountUp amount={deviceData.summary.totalRevenue} duration={1300} />
                      </h3>
                    </div>
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <IndianRupee className="h-5 w-5 text-blue-500" />
                    </div>
                  </div>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 p-6 hover:-translate-y-1 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-purple-500/70 mb-2">
                        Total Bookings
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CountUp end={deviceData.summary.totalBookings} duration={1000} />
                      </h3>
                    </div>
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <CalendarDays className="h-5 w-5 text-purple-500" />
                    </div>
                  </div>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-emerald-600/5 border-green-500/20 p-6 hover:-translate-y-1 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-green-500/70 mb-2">
                        Hours Booked
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CountUp end={deviceData.summary.totalHours} duration={1000} />
                      </h3>
                    </div>
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <Gamepad2 className="h-5 w-5 text-green-500" />
                    </div>
                  </div>
                </Card>
                <Card className="bg-gradient-to-br from-amber-500/10 to-orange-600/5 border-amber-500/20 p-6 hover:-translate-y-1 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase text-amber-500/70 mb-2">
                        Avg Revenue
                      </p>
                      <h3 className="text-2xl font-black text-white">
                        <CurrencyCountUp amount={deviceData.summary.averageRevenuePerBooking} duration={1100} />
                      </h3>
                    </div>
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-amber-500" />
                    </div>
                  </div>
                </Card>
              </div>

              {/* Device Type Breakdown */}
              <Card className="bg-[var(--surface)] border-[#27272a] p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Gamepad2 className="h-5 w-5 text-blue-500" />
                  </div>
                  <h3 className="text-sm font-black uppercase text-white">
                    Device Type Performance
                  </h3>
                </div>
                <div className="space-y-4">
                  {deviceData.deviceBreakdown.map((device: any, index: number) => {
                    const colors = [
                      { bg: 'from-blue-500/10 to-cyan-500/5', border: 'border-blue-500/20', text: 'text-blue-400', icon: 'bg-blue-500/10', iconColor: 'text-blue-500' },
                      { bg: 'from-purple-500/10 to-pink-500/5', border: 'border-purple-500/20', text: 'text-purple-400', icon: 'bg-purple-500/10', iconColor: 'text-purple-500' },
                      { bg: 'from-green-500/10 to-emerald-500/5', border: 'border-green-500/20', text: 'text-green-400', icon: 'bg-green-500/10', iconColor: 'text-green-500' },
                      { bg: 'from-amber-500/10 to-orange-500/5', border: 'border-amber-500/20', text: 'text-amber-400', icon: 'bg-amber-500/10', iconColor: 'text-amber-500' },
                    ];
                    const color = colors[index % colors.length];

                    return (
                      <div
                        key={device.deviceType}
                        className={`p-5 bg-gradient-to-r ${color.bg} border ${color.border} rounded-xl hover:scale-[1.01] transition-all`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 ${color.icon} rounded-lg`}>
                              <Gamepad2 className={`h-5 w-5 ${color.iconColor}`} />
                            </div>
                            <h4 className={`text-base font-black ${color.text}`}>
                              {device.deviceType}
                            </h4>
                          </div>
                          <p className="text-xl font-black text-white">
                            <CurrencyCountUp amount={device.totalRevenue} duration={1200} />
                          </p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-3 bg-[var(--background)]/50 rounded-lg">
                            <p className="text-xs text-secondary-content uppercase font-bold mb-1">Bookings</p>
                            <p className="text-base font-black text-white">
                              <CountUp end={device.totalBookings} duration={800} />
                            </p>
                          </div>
                          <div className="p-3 bg-[var(--background)]/50 rounded-lg">
                            <p className="text-xs text-secondary-content uppercase font-bold mb-1">Hours</p>
                            <p className="text-base font-black text-white">
                              <CountUp end={device.totalHours} duration={800} />h
                            </p>
                          </div>
                          <div className="p-3 bg-[var(--background)]/50 rounded-lg">
                            <p className="text-xs text-secondary-content uppercase font-bold mb-1">Avg Players</p>
                            <p className="text-base font-black text-white">
                              <CountUp end={device.averagePlayersPerBooking} duration={900} decimals={1} />
                            </p>
                          </div>
                          <div className="p-3 bg-[var(--background)]/50 rounded-lg">
                            <p className="text-xs text-secondary-content uppercase font-bold mb-1">Extra Rev</p>
                            <p className={`text-base font-black ${color.text}`}>
                              <CurrencyCountUp amount={device.extraPlayerRevenue} duration={1000} />
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* Revenue Reports Tab */}
          {activeTab === "revenue" && revenueData && (
            <div className="space-y-6">
              {/* Revenue Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 p-6 hover:-translate-y-1">
                  <p className="text-xs font-black uppercase text-green-500/70 mb-2">
                    Total Revenue
                  </p>
                  <h3 className="text-3xl font-black text-white mb-4">
                    <CurrencyCountUp amount={revenueData.summary.totalRevenue} duration={1500} />
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-data-placeholder">Device Revenue:</span>
                      <span className="font-bold text-white">
                        <CurrencyCountUp amount={revenueData.summary.deviceRevenue} duration={1200} />
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-data-placeholder">Food Revenue:</span>
                      <span className="font-bold text-white">
                        <CurrencyCountUp amount={revenueData.summary.foodRevenue} duration={1200} />
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="bg-[var(--surface)] border-[#27272a] p-6 hover:-translate-y-1">
                  <p className="text-xs font-black uppercase 0text-zinc-50 mb-2">
                    Payment Status
                  </p>
                  {/* Every booking in range, not just the ones that paid - the
                      bars are shares of the whole, so an unpaid booking has to be
                      in the denominator or "pending" can never be more than 0%. */}
                  <div className="space-y-3">
                    {([
                      { label: "Paid", count: revenueData.summary.paidBookings, bar: "bg-green-500", text: "text-green-500" },
                      { label: "Partial", count: revenueData.summary.partialBookings || 0, bar: "bg-blue-500", text: "text-blue-500" },
                      { label: "Pending", count: revenueData.summary.pendingBookings, bar: "bg-amber-500", text: "text-amber-500" }
                    ] as const)
                      // A row that is always zero is noise; Paid always shows.
                      .filter((row) => row.label === "Paid" || row.count > 0)
                      .map((row) => {
                        const total = revenueData.summary.paymentStatusTotal || 0;
                        // Guard the divide: with nothing in range this was NaN%,
                        // which the browser drops, leaving a bar stuck full width.
                        const share = total > 0 ? (row.count / total) * 100 : 0;

                        return (
                          <div key={row.label}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs text-data-placeholder">{row.label}</span>
                              <span className={`text-sm font-black ${row.text}`}>
                                <CountUp end={row.count} duration={800} />
                              </span>
                            </div>
                            <div className="w-full bg-zinc-900 rounded-full h-2">
                              <div
                                className={`${row.bar} h-2 rounded-full transition-all duration-[1500ms] ease-out`}
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}

                    {revenueData.summary.outstandingAmount > 0 && (
                      <div className="flex justify-between items-baseline pt-2 border-t border-[#27272a]">
                        <span className="text-xs text-data-placeholder">Amount Due</span>
                        <span className="text-sm font-black text-amber-500 tabular-nums">
                          ₹{formatCurrency(revenueData.summary.outstandingAmount)}
                        </span>
                      </div>
                    )}

                    {/* Cancelled bookings are in none of the figures above - they
                        are not trade and nothing is owed on them. What can still be
                        outstanding is a refund, so that is what is shown. */}
                    <div className="flex justify-between items-baseline pt-2 border-t border-[#27272a]">
                      <span className="text-xs text-data-placeholder">Cancelled</span>
                      <span className="text-sm font-black text-red-400 tabular-nums">
                        <CountUp end={revenueData.summary.cancelledBookings || 0} duration={800} />
                      </span>
                    </div>

                    {Number(revenueData.summary.cancelledAwaitingRefund || 0) > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-data-placeholder">Refund Due</span>
                        <span className="text-sm font-black text-red-400 tabular-nums">
                          ₹{formatCurrency(revenueData.summary.cancelledAwaitingRefund)}
                        </span>
                      </div>
                    )}

                    {Number(revenueData.summary.cancelledRefunded || 0) > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-data-placeholder">Refunded</span>
                        <span className="text-sm font-black text-green-400 tabular-nums">
                          ₹{formatCurrency(revenueData.summary.cancelledRefunded)}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="bg-[var(--surface)] border-[#27272a] p-6 hover:-translate-y-1">
                  <p className="text-xs font-black uppercase text-white mb-2">
                    Revenue Split
                  </p>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-data-placeholder">Device</span>
                        <span className="text-sm font-black text-blue-500">
                          <CountUp end={revenueData.summary.deviceRevenuePercentage} duration={1000} decimals={1} suffix="%" />
                        </span>
                      </div>
                      <div className="w-full bg-zinc-900 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-[1500ms] ease-out"
                          style={{ width: `${revenueData.summary.deviceRevenuePercentage}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-data-placeholder">Food</span>
                        <span className="text-sm font-black text-amber-500">
                          <CountUp end={revenueData.summary.foodRevenuePercentage} duration={1000} decimals={1} suffix="%" />
                        </span>
                      </div>
                      <div className="w-full bg-zinc-900 rounded-full h-2">
                        <div
                          className="bg-amber-500 h-2 rounded-full transition-all duration-[1500ms] ease-out"
                          style={{ width: `${revenueData.summary.foodRevenuePercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Booking Source Breakdown */}
              <Card className="bg-[var(--surface)] border-[#27272a] p-6">
                <h3 className="text-sm font-black uppercase text-muted-content mb-4">
                  Revenue by Source
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {revenueData.sourceBreakdown.map((source: any) => (
                    <div
                      key={source.source}
                      className="p-4 bg-[var(--background)] border border-[#27272a] rounded-lg"
                    >
                      <p className="text-xs font-black uppercase text-white mb-2">
                        {source.source === "walk-in" ? "Walk-In Booking" : "Pre-Booking"}
                      </p>
                      <h4 className="text-xl font-black text-primary mb-1">
                        <CurrencyCountUp amount={source.totalRevenue} duration={1200} />
                      </h4>
                      <p className="text-xs text-data-placeholder">
                        <CountUp end={source.bookingCount} duration={800} /> bookings
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Payment Method Breakdown */}
              <Card className="bg-[var(--surface)] border-[#27272a] p-6">
                <h3 className="text-sm font-black uppercase text-muted-content mb-4">
                  Revenue by Payment Method
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {/* Cash */}
                  <div className="p-4 bg-[var(--background)] border border-[#27272a] rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">💵</span>
                      <p className="text-xs font-black uppercase text-white">Cash</p>
                    </div>
                    <h4 className="text-xl font-black text-green-400 mb-1">
                      <CurrencyCountUp amount={revenueData.summary.totalCash} duration={1100} />
                    </h4>
                    <p className="text-xs text-data-placeholder">
                      <CountUp end={revenueData.summary.cashPercentage} duration={900} decimals={1} suffix="% of total" />
                    </p>
                  </div>

                  {/* Card */}
                  <div className="p-4 bg-[var(--background)] border border-[#27272a] rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">💳</span>
                      <p className="text-xs font-black uppercase text-white">Card</p>
                    </div>
                    <h4 className="text-xl font-black text-blue-400 mb-1">
                      <CurrencyCountUp amount={revenueData.summary.totalCard} duration={1100} />
                    </h4>
                    <p className="text-xs text-data-placeholder">
                      <CountUp end={revenueData.summary.cardPercentage} duration={900} decimals={1} suffix="% of total" />
                    </p>
                  </div>

                  {/* UPI */}
                  <div className="p-4 bg-[var(--background)] border border-[#27272a] rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">📱</span>
                      <p className="text-xs font-black uppercase text-white">UPI</p>
                    </div>
                    <h4 className="text-xl font-black text-purple-400 mb-1">
                      <CurrencyCountUp amount={revenueData.summary.totalUpi} duration={1100} />
                    </h4>
                    <p className="text-xs text-data-placeholder">
                      <CountUp end={revenueData.summary.upiPercentage} duration={900} decimals={1} suffix="% of total" />
                    </p>
                  </div>

                  {/* Online (Razorpay) */}
                  <div className="p-4 bg-[var(--background)] border border-[#27272a] rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🌐</span>
                      <p className="text-xs font-black uppercase text-white">Online</p>
                    </div>
                    <h4 className="text-xl font-black text-primary mb-1">
                      <CurrencyCountUp amount={revenueData.summary.totalOnline} duration={1100} />
                    </h4>
                    <p className="text-xs text-data-placeholder">
                      <CountUp end={revenueData.summary.onlinePercentage} duration={900} decimals={1} suffix="% of total" />
                    </p>
                  </div>
                </div>
              </Card>

              {/* Daily Revenue Chart */}
              <Card className="bg-[var(--surface)] border-[#27272a] p-6">
                <h3 className="text-sm font-black uppercase text-muted-content mb-4">
                  Daily Revenue Trend
                </h3>
                <div className="space-y-2">
                  {revenueData.dailyRevenue.slice(-10).map((day: any) => {
                    const maxRevenue = Math.max(...revenueData.dailyRevenue.map((d: any) => d.totalRevenue));
                    const percentage = (day.totalRevenue / maxRevenue) * 100;

                    return (
                      <div key={day.date} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-data-placeholder">
                            {new Date(day.date).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                          <span className="font-bold text-white">
                            <CurrencyCountUp amount={day.totalRevenue} duration={1000} />
                          </span>
                        </div>
                        <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden">
                          <div className="flex h-full">
                            <div
                              className="bg-blue-500 transition-all duration-[1500ms] ease-out"
                              style={{
                                width: `${(day.deviceRevenue / day.totalRevenue) * percentage}%`
                              }}
                            />
                            <div
                              className="bg-amber-500 transition-all duration-[1500ms] ease-out"
                              style={{
                                width: `${(day.foodRevenue / day.totalRevenue) * percentage}%`
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-blue-400">
                            Device: <CurrencyCountUp amount={day.deviceRevenue} duration={800} />
                          </span>
                          <span className="text-amber-400">
                            Food: <CurrencyCountUp amount={day.foodRevenue} duration={800} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-[#27272a]">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded"></div>
                    <span className="text-xs text-data-placeholder">Device</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-amber-500 rounded"></div>
                    <span className="text-xs text-data-placeholder">Food</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Profit & Loss Tab */}
          {activeTab === "profit" && (
            <ProfitTab dateFrom={dateFrom} dateTo={dateTo} />
          )}

          {/* Expenses Tab */}
          {activeTab === "expenses" && (
            <ExpensesTab dateFrom={dateFrom} dateTo={dateTo} />
          )}
        </>
      )}
    </div>
  );
}

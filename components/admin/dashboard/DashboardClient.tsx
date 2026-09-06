"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  IndianRupee, TrendingUp, Calendar, Users, Clock,
  Gamepad2, UtensilsCrossed, Activity, ArrowRight,
  CheckCircle2, Loader2, AlertCircle, PlusCircle, Eye, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { BookingStatusBadge } from "@/components/admin/bookings/BookingStatusBadge";
import { formatDbTime } from "@/lib/utils/timeSlots";
import { formatClockTime12h } from "@/lib/utils/dates";
import {
  getDashboardData,
  getTodaysRevenueDetails,
  getActiveSessionsDetails,
  getUpcomingBookingsDetails,
  getAvailableDevicesDetails
} from "@/app/(admin)/admin/dashboard/actions";
import { TodaysRevenueModal } from "@/components/admin/dashboard/TodaysRevenueModal";
import { ActiveSessionsModal } from "@/components/admin/dashboard/ActiveSessionsModal";
import { UpcomingBookingsModal } from "@/components/admin/dashboard/UpcomingBookingsModal";
import { AvailableDevicesModal } from "@/components/admin/dashboard/AvailableDevicesModal";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { CountUp, CurrencyCountUp } from "@/components/shared/CountUp";
import { RevealAmount } from "@/components/admin/dashboard/RevealAmount";

export type DashboardInitialData = {
  stats: any;
  quickStats: any;
  recentBookings: any[];
  schedule: any[];
};

export default function DashboardClient({ initialData }: { initialData: DashboardInitialData }) {
  const router = useRouter();
  /**
   * Seeded from the server render, so there is no loading state on first paint
   * and no fetch waiting on hydration. `loading` still exists for the manual
   * refresh button, which does go back to the server.
   */
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(initialData.stats);
  const [recentBookings, setRecentBookings] = useState<any[]>(initialData.recentBookings);
  const [todaysSchedule, setTodaysSchedule] = useState<any[]>(initialData.schedule);
  const [quickStats, setQuickStats] = useState<any>(initialData.quickStats);

  // Modal states
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [revenueDetails, setRevenueDetails] = useState<any[]>([]);
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);
  const [sessionsDetails, setSessionsDetails] = useState<any[]>([]);
  const [upcomingModalOpen, setUpcomingModalOpen] = useState(false);
  const [upcomingDetails, setUpcomingDetails] = useState<any[]>([]);
  const [devicesModalOpen, setDevicesModalOpen] = useState(false);
  const [devicesDetails, setDevicesDetails] = useState<any[]>([]);

  /**
   * A booking opened in another tab can be checked out, marked paid or have food
   * added, none of which this tab would hear about - it would sit showing stale
   * revenue until manually refreshed. Refetching when the operator returns to
   * this tab keeps the figures honest. Silent, so any open stat modal survives.
   */
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") loadDashboardData(true);
    };

    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  }, []);

  /**
   * `silent` refreshes the figures without flipping `loading`, which would swap
   * the whole page for the full-screen loader and tear down any open stat modal.
   */
  const loadDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      /**
       * One call, not four. Each server action re-authenticates against the
       * Supabase auth server before it can read anything, and that round trip
       * dominated this page's load - the queries behind it run in well under a
       * millisecond.
       */
      const result = await getDashboardData();

      if (result.success) {
        setStats(result.stats);
        setQuickStats(result.quickStats);
        setRecentBookings(result.recentBookings);
        setTodaysSchedule(result.schedule);
      } else {
        console.error("Failed to load dashboard data:", result.error);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadDashboardData();
    toast.success("Refreshed", { description: "Dashboard data reloaded" });
  };

  /**
   * Set after mount, never during render.
   *
   * This component is server-rendered now, and a clock read during render
   * produces one time on the server and a different one in the browser a moment
   * later - React treats that as a hydration mismatch and warns. Rendering
   * nothing until mounted is the honest version: there genuinely is no
   * meaningful "current time" to show until the page is running in front of
   * someone.
   */
  const [currentTime, setCurrentTime] = useState<string | null>(null);

  useEffect(() => {
    // `formatClockTime12h` pins Asia/Kolkata, so this reads the arena's clock
    // rather than whatever zone the operator's laptop is set to.
    const readClock = () => setCurrentTime(formatClockTime12h(new Date()));

    readClock();
    // Ticks so the header does not sit showing the minute the page was opened.
    const timer = setInterval(readClock, 30_000);
    return () => clearInterval(timer);
  }, []);

  const handleRevenueClick = async () => {
    const result = await getTodaysRevenueDetails();
    if (result.success) {
      setRevenueDetails(result.bookings);
      setRevenueModalOpen(true);
    }
  };

  const handleSessionsClick = async () => {
    const result = await getActiveSessionsDetails();
    if (result.success) {
      setSessionsDetails(result.sessions);
      setSessionsModalOpen(true);
    }
  };

  const handleUpcomingClick = async () => {
    const result = await getUpcomingBookingsDetails();
    if (result.success) {
      setUpcomingDetails(result.bookings);
      setUpcomingModalOpen(true);
    }
  };

  const handleDevicesClick = async () => {
    console.log('Available Devices card clicked');
    try {
      const result = await getAvailableDevicesDetails();
      console.log('Devices result:', result);
      if (result.success) {
        setDevicesDetails(result.devices);
        setDevicesModalOpen(true);
      } else {
        console.error('Failed to fetch devices:', result.error);
        toast.error('Failed to load device details');
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
      toast.error('An error occurred while loading devices');
    }
  };

  /** Opens one booking from a list on the dashboard itself. */
  const openBooking = (bookingId?: string | null) => {
    if (!bookingId) return;
    router.push(`/admin/bookings/${bookingId}`);
  };

  /**
   * Opens a booking from one of the stat modals (Today's Revenue, Active
   * Sessions, Upcoming Bookings) in a new tab rather than a second dialog on top
   * of the one already open. The stat modal stays put behind it, so the figure
   * being reviewed is not lost.
   *
   * noopener/noreferrer because the new tab must not get a handle on this one.
   */
  const handleBookingClick = (bookingId: string) => {
    window.open(`/admin/bookings/${bookingId}`, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <BreakpointLoader size="lg" text="Loading Dashboard..." />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase text-white tracking-tight">
            DASHBOARD
          </h1>
          <p className="text-description font-medium mt-1">
            Welcome back! Here's what's happening today
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm-enhanced">
            <Clock className="h-4 w-4" />
            <span className="font-mono">{currentTime ?? "--:--"}</span>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={loading}
            variant="outline"
            className="border-[#27272a] text-white hover:bg-[var(--surface)] font-black uppercase text-xs h-10 px-4"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => router.push("/admin/bookings/walk-in")}
            className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase text-xs h-10 px-6"
          >
            <PlusCircle className="h-4 w-4 mr-2 stroke-[3]" />
            New Walk-In
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card
          className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 p-5 cursor-pointer hover:border-green-500/40 transition-all hover:scale-[1.02]"
          onClick={handleRevenueClick}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-stat-label text-green-400 mb-1">
                Today's Revenue
              </p>
              <h3 className="text-2xl font-black text-white mb-1">
                <RevealAmount amount={stats?.todaysRevenue || 0} label="today's revenue" />
              </h3>
              <p className="text-min-enhanced text-secondary-content">
                From <CountUp end={stats?.todaysBookings || 0} duration={800} /> bookings
              </p>
            </div>
            <div className="p-2 bg-green-500/10 rounded-lg">
              <IndianRupee className="h-5 w-5 text-green-500" />
            </div>
          </div>
        </Card>

        <Card
          className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 p-5 cursor-pointer hover:border-blue-500/40 transition-all hover:scale-[1.02]"
          onClick={handleSessionsClick}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-stat-label text-blue-400 mb-1">
                Active Sessions
              </p>
              <h3 className="text-2xl font-black text-white mb-1">
                <CountUp end={stats?.activeSessions || 0} duration={800} />
              </h3>
              <p className="text-min-enhanced text-secondary-content">
                Currently playing
              </p>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Activity className="h-5 w-5 text-blue-500" />
            </div>
          </div>
        </Card>

        <Card
          className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20 p-5 cursor-pointer hover:border-amber-500/40 transition-all hover:scale-[1.02]"
          onClick={handleUpcomingClick}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-stat-label text-amber-400 mb-1">
                Upcoming
              </p>
              <h3 className="text-2xl font-black text-white mb-1">
                <CountUp end={stats?.upcomingBookings || 0} duration={800} />
              </h3>
              <p className="text-min-enhanced text-secondary-content">
                Next 2 hours
              </p>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Calendar className="h-5 w-5 text-amber-500" />
            </div>
          </div>
        </Card>

        <Card
          className="bg-gradient-to-br from-amber-500/10 to-orange-600/5 border-amber-500/20 p-5 cursor-pointer hover:border-amber-500/40 transition-all hover:scale-[1.02]"
          onClick={handleDevicesClick}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-stat-label text-amber-400 mb-1">
                Available Devices
              </p>
              <h3 className="text-2xl font-black text-white mb-1">
                <CountUp end={stats?.availableDevices || 0} duration={800} />
              </h3>
              <p className="text-min-enhanced text-secondary-content">
                Ready to use
              </p>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Gamepad2 className="h-5 w-5 text-amber-500" />
            </div>
          </div>
        </Card>

        <Card className="bg-[var(--surface)] border-[#27272a] p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-stat-label mb-1">
                This Week
              </p>
              <h3 className="text-2xl font-black text-white mb-1">
                <RevealAmount amount={quickStats?.thisWeekRevenue || 0} label="this week's revenue" />
              </h3>
              <div className="flex items-center gap-1 text-xs text-green-500">
                <TrendingUp className="h-3 w-3" />
                <span>Last 7 days</span>
              </div>
            </div>
            <div className="p-2 bg-zinc-900 rounded-lg">
              <TrendingUp className="h-5 w-5 text-muted-content" />
            </div>
          </div>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[var(--surface)] border-[#27272a] p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-label-enhanced">
              Today's Food Orders
            </p>
            <UtensilsCrossed className="h-4 w-4 text-muted-content" />
          </div>
          <h4 className="text-2xl font-black text-white">
            {quickStats?.todaysFoodOrders || 0}
          </h4>
          <p className="text-min-enhanced text-secondary-content mt-1">
            Active F&B operations
          </p>
        </Card>

        <Card className="bg-[var(--surface)] border-[#27272a] p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-label-enhanced">
              Peak Hour Today
            </p>
            <Clock className="h-4 w-4 text-muted-content" />
          </div>
          <h4 className="text-2xl font-black text-white">
            {quickStats?.peakHour || "N/A"}
          </h4>
          <p className="text-min-enhanced text-secondary-content mt-1">
            {quickStats?.peakHourBookings || 0} bookings
          </p>
        </Card>

        <Card className="bg-[var(--surface)] border-[#27272a] p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-label-enhanced">
              Quick Actions
            </p>
            <ArrowRight className="h-4 w-4 text-muted-content" />
          </div>
          <div className="space-y-2">
            <Button
              onClick={() => router.push("/admin/bookings")}
              size="sm"
              className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black w-full justify-center "
            >
              <Eye className="h-4 w-4 mr-2" />
              View All Bookings
            </Button>
            <Button
              onClick={() => router.push("/admin/reports")}
              size="sm"
              className="w-full justify-center bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              View Reports
            </Button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <Card className="bg-[var(--surface)] border-[#27272a] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-section-header">
              Today's Schedule
            </h3>
            <Button
              onClick={() => router.push("/admin/bookings")}
              variant="ghost"
              size="sm"
              className="text-min-enhanced text-secondary-content hover:text-white"
            >
              View All
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {todaysSchedule.length > 0 ? (
              todaysSchedule.map((slot: any) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between p-3 bg-[var(--background)] border border-[#27272a] rounded-lg hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => openBooking(slot.bookings?.id)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex flex-col items-center justify-center w-16 h-16 bg-zinc-900 rounded-lg">
                      <span className="text-xs font-black text-primary whitespace-nowrap">
                        {formatDbTime(slot.slot_start_time)}
                      </span>
                      <span className="text-[11px] text-muted-content whitespace-nowrap">
                        {formatDbTime(slot.slot_end_time)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">
                        {slot.bookings?.customer_name || "Unknown"}
                      </p>
                      <p className="text-min-enhanced text-secondary-content">
                        {slot.device_type} - {slot.device_station_number}
                      </p>
                      <p className="text-min text-muted-content mt-0.5">
                        {slot.player_count} player{slot.player_count > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <BookingStatusBadge status={slot.bookings?.status} />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Calendar className="h-12 w-12 text-zinc-800 mb-3" />
                <p className="text-sm-enhanced">No bookings scheduled for today</p>
              </div>
            )}
          </div>
        </Card>

        {/* Recent Bookings */}
        <Card className="bg-[var(--surface)] border-[#27272a] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-section-header">
              Recent Bookings
            </h3>
            <Button
              onClick={() => router.push("/admin/bookings")}
              variant="ghost"
              size="sm"
              className="text-min-enhanced text-secondary-content hover:text-white"
            >
              View All
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {recentBookings.length > 0 ? (
              recentBookings.map((booking: any) => {
                const slot = booking.booking_device_slots?.[0];
                return (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 bg-[var(--background)] border border-[#27272a] rounded-lg hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => openBooking(booking.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-white">
                          {booking.booking_number}
                        </p>
                        <BookingStatusBadge status={booking.status} />
                      </div>
                      <p className="text-min-enhanced text-secondary-content">
                        {booking.customer_name} • {booking.customer_phone}
                      </p>
                      {slot && (
                        <p className="text-min text-muted-content mt-1">
                          {slot.device_type} • {new Date(slot.slot_date).toLocaleDateString('en-IN')}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-primary">
                        ₹{Number(booking.total_amount).toLocaleString('en-IN')}
                      </p>
                      <p className="text-[11px] text-muted-content uppercase mt-0.5">
                        {booking.payment_status}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-12 w-12 text-zinc-800 mb-3" />
                <p className="text-sm-enhanced">No recent bookings</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* System Status */}
      <Card className="bg-[var(--surface)] border-[#27272a] p-6">
        <h3 className="text-sm font-black uppercase text-muted-content mb-4">
          System Status
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-3 bg-[var(--background)] border border-[#27272a] rounded-lg">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-content">Bookings System</p>
              <p className="text-sm font-bold text-white">Operational</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-[var(--background)] border border-[#27272a] rounded-lg">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-content">Payment Gateway</p>
              <p className="text-sm font-bold text-white">Operational</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-[var(--background)] border border-[#27272a] rounded-lg">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-content">Food Orders</p>
              <p className="text-sm font-bold text-white">Operational</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-[var(--background)] border border-[#27272a] rounded-lg">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-content">Database</p>
              <p className="text-sm font-bold text-white">Connected</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Modals */}
      <TodaysRevenueModal
        open={revenueModalOpen}
        onClose={() => setRevenueModalOpen(false)}
        bookings={revenueDetails}
        totalRevenue={stats?.todaysRevenue || 0}
        onBookingClick={handleBookingClick}
      />

      <ActiveSessionsModal
        open={sessionsModalOpen}
        onClose={() => setSessionsModalOpen(false)}
        sessions={sessionsDetails}
        onBookingClick={handleBookingClick}
      />

      <UpcomingBookingsModal
        open={upcomingModalOpen}
        onClose={() => setUpcomingModalOpen(false)}
        bookings={upcomingDetails}
        onBookingClick={handleBookingClick}
      />

      <AvailableDevicesModal
        open={devicesModalOpen}
        onClose={() => setDevicesModalOpen(false)}
        devices={devicesDetails}
      />

      {/* Booking detail is not rendered here - it opens as its own page in a new
          tab (see handleBookingClick), so the stat modals never stack. */}
    </div>
  );
}

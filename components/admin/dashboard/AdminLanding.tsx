"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, BarChart2, CalendarDays, Check, Clock3, Crown, Gamepad2, IndianRupee, LogOut, PartyPopper, Plus, RefreshCw, Search, Tag, Users, Utensils, Wallet, WalletCards } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOutAdmin } from "@/lib/auth/admin-signout";
import { formatDbTime } from "@/lib/utils/timeSlots";
import type { DashboardInitialData } from "./DashboardClient";
import { getDashboardData } from "@/app/(admin)/admin/dashboard/actions";
import { getUserRole, type UserRole } from "@/lib/auth/roles";

const navLinks = [
  ["Dashboard", "/admin/dashboard"], ["Bookings", "/admin/bookings"], ["Timeline", "/admin/timeline"],
  ["Devices", "/admin/devices"], ["Food", "/admin/food"], ["Customers", "/admin/customers"],
  ["Subscription", "/admin/subscription"], ["Wallet credits", "/admin/wallet-credits"],
  ["Promo codes", "/admin/promo-code"], ["Happy hours", "/admin/happy-hours"], ["Reports", "/admin/reports"],
];

export default function AdminLanding({ initialData }: { initialData: DashboardInitialData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [role, setRole] = useState<UserRole>(null);
  useEffect(() => { getUserRole().then(setRole); }, []);
  const refresh = async () => {
    setLoading(true);
    const result = await getDashboardData();
    if (result.success) setData({ stats: result.stats, quickStats: result.quickStats, recentBookings: result.recentBookings, schedule: result.schedule });
    else toast.error("Could not refresh dashboard", { description: result.error });
    setLoading(false);
  };
  const logout = async () => {
    const { error } = await signOutAdmin();
    if (error) return toast.error("Logout failed");
    router.push("/admin/login");
    router.refresh();
  };
  const searchBookings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchTerm.trim();
    if (query) router.push(`/admin/bookings?q=${encodeURIComponent(query)}`);
  };
  const metrics = [
    { label: "Today’s collections", value: `₹${Number(data.stats?.todaysRevenue || 0).toLocaleString("en-IN")}`, note: "Bookings and wallet top-ups", icon: IndianRupee },
    { label: "Active sessions", value: data.stats?.activeSessions || 0, note: "Players currently in the arena", icon: Activity },
    { label: "Upcoming bookings", value: data.stats?.upcomingBookings || 0, note: "Starting in the next 2 hours", icon: CalendarDays },
    { label: "Available devices", value: data.stats?.availableDevices || 0, note: "Ready for the next player", icon: Gamepad2 },
  ];

  const visibleNavLinks = navLinks.filter(([, href]) => href !== "/admin/reports" || role !== "staff");
  return <div className="admin-landing min-h-full text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1720px] items-center gap-4 px-4 lg:px-6">
        <Link href="/admin/dashboard" className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight"><Image src="/bp_logo.png" alt="Break Point Arena" width={36} height={36} className="h-9 w-9 object-contain" priority /><span className="text-[14px]">Break Point Arena</span></Link>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-slate-600">
          <form onSubmit={searchBookings} role="search" className="relative hidden sm:block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search bookings by customer, phone, or booking number" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search bookings" className="h-9 w-[190px] rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" /></form>
          <Link href="/admin/bookings" aria-label="Search bookings" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 sm:hidden"><Search className="h-4 w-4" /></Link>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={logout} className="!h-9 !w-9 !rounded-md !border !border-slate-200 !bg-white !text-slate-600 !shadow-none before:!hidden hover:!border-slate-300 hover:!bg-slate-50"><LogOut className="h-4 w-4" /></Button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[1720px] lg:grid lg:grid-cols-[208px_minmax(0,1fr)]">
      <aside className="hidden border-r border-slate-200 bg-white/60 lg:block">
        <div className="sticky top-[60px] flex max-h-[calc(100vh-60px)] flex-col overflow-y-auto px-3 py-5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Arena</p>
          <nav className="space-y-1">{visibleNavLinks.map(([label, href]) => { const Icon = href === "/admin/dashboard" ? Activity : href === "/admin/bookings" ? CalendarDays : href === "/admin/timeline" ? Clock3 : href === "/admin/devices" ? Gamepad2 : href === "/admin/food" ? Utensils : href === "/admin/customers" ? Users : href === "/admin/reports" ? BarChart2 : href === "/admin/subscription" ? Crown : href === "/admin/wallet-credits" ? WalletCards : href === "/admin/promo-code" ? Tag : href === "/admin/happy-hours" ? PartyPopper : ArrowRight; return <Link key={href} href={href} className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] font-medium transition ${href === "/admin/dashboard" ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}><Icon className="h-4 w-4 shrink-0" />{label}</Link>; })}</nav>
        </div>
      </aside>

      <main className="min-w-0 px-4 pb-8 pt-4 sm:px-5 lg:px-6 lg:pt-5">
        <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 lg:hidden">{visibleNavLinks.map(([label, href]) => <Link key={href} href={href} className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium ${href === "/admin/dashboard" ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}>{label}</Link>)}</nav>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div><p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[.13em] text-blue-700">Arena overview</p><h1 className="text-[23px] font-semibold tracking-tight text-slate-900">Good day, Admin</h1><p className="mt-0.5 text-[13px] text-slate-600">Today at Break Point Arena</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={refresh} disabled={loading} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 text-blue-700 ${loading ? "animate-spin" : ""}`} />Refresh</button><button type="button" onClick={() => router.push("/admin/bookings/walk-in")} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-blue-800 bg-blue-700 px-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:border-blue-900 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"><Plus className="h-3.5 w-3.5" />New walk-in</button></div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <section className="min-w-0 space-y-4" aria-label="Daily activities">
            <Card className="rounded-lg border-slate-200 bg-white !p-0 !shadow-sm">
              <div className="flex items-center justify-between px-4 pb-2.5 pt-4"><div><h2 className="text-[15px] font-semibold text-slate-900">Today’s schedule</h2><p className="mt-0.5 text-xs text-slate-600">Bookings and check-ins · {data.schedule.length} scheduled stations</p></div><Link href="/admin/bookings" className="flex items-center gap-1 text-xs font-semibold text-blue-800 hover:text-blue-900">All bookings <ArrowRight className="h-3.5 w-3.5" /></Link></div>
              <div className="divide-y divide-slate-100">{data.schedule.length ? data.schedule.slice(0,8).map((slot: any) => <button key={slot.id} onClick={() => slot.bookings?.id && router.push(`/admin/bookings/${slot.bookings.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"><span className="w-[92px] shrink-0 text-xs font-medium tabular-nums text-slate-600">{formatDbTime(slot.slot_start_time)} <span className="text-slate-400">–</span> {formatDbTime(slot.slot_end_time)}</span><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700"><Users className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-slate-800">{slot.bookings?.customer_name || "Walk-in"}</span><span className="mt-0.5 block truncate text-xs text-slate-600">{slot.device_type} · Station {slot.device_station_number} · {slot.player_count} players</span></span><span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium capitalize text-emerald-800 sm:block">{slot.bookings?.status || "Confirmed"}</span></button>) : <p className="py-8 text-center text-sm text-slate-500">No bookings scheduled for today.</p>}</div>
            </Card>

            <Card className="overflow-hidden rounded-lg border-slate-200 bg-white !p-0 !shadow-sm">
              <div className="flex items-center justify-between px-4 pb-3 pt-4"><div><h2 className="text-[15px] font-semibold text-slate-900">Recent bookings</h2><p className="mt-0.5 text-xs text-slate-600">Latest reservations across your arena</p></div><Link href="/admin/bookings" className="text-xs font-semibold text-blue-800 hover:text-blue-900">View all <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link></div>
              <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-[13px]"><thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-600"><tr><th scope="col" className="px-4 py-2.5">Booking</th><th scope="col" className="px-3 py-2.5">Customer</th><th scope="col" className="px-3 py-2.5 text-right">Amount</th><th scope="col" className="px-4 py-2.5">Payment</th></tr></thead><tbody className="divide-y divide-slate-100">{data.recentBookings.slice(0,8).map((booking: any) => <tr key={booking.id} className="text-slate-700 transition hover:bg-blue-50/50"><td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800"><Link className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={`/admin/bookings/${booking.id}`}>{booking.booking_number}</Link></td><td className="max-w-[220px] truncate px-3 py-2.5">{booking.customer_name}</td><td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">₹{Number(booking.total_amount || 0).toLocaleString("en-IN")}</td><td className="whitespace-nowrap px-4 py-2.5"><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium capitalize text-slate-700">{booking.payment_status || "Pending"}</span></td></tr>)}</tbody></table>{!data.recentBookings.length && <p className="px-4 py-8 text-center text-sm text-slate-500">No recent bookings</p>}</div>
            </Card>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Manage bookings","/admin/bookings",CalendarDays],["Devices & stations","/admin/devices",Gamepad2],["Customers","/admin/customers",Users],["Food menu","/admin/food",Utensils]].map(([label,href,Icon]: any)=><Link key={href} href={href} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50/50"><Icon className="h-4 w-4 shrink-0 text-blue-800" />{label}</Link>)}</div>
          </section>

          <aside className="space-y-3" aria-label="Key metrics">
            <Card className="rounded-lg border-slate-200 bg-white !p-3.5 !shadow-sm">
              <div className="mb-3"><h2 className="text-[13px] font-semibold text-slate-900">At a glance</h2><p className="mt-0.5 text-[11px] text-slate-600">Today and the past 7 days</p></div>
              <div className="space-y-2.5">
                {metrics.map(({label,value}) => <div key={label} className="flex items-center justify-between gap-3"><span className="text-xs text-slate-600">{label}</span><span className="text-xs font-semibold tabular-nums text-slate-900">{value}</span></div>)}
                <div className="border-t border-slate-100 pt-2.5" />
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-600">Booking settlements</span><span className="text-xs font-semibold tabular-nums text-slate-900">₹{Number(data.stats?.todaysBookingSettlements || 0).toLocaleString("en-IN")}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-600">Collections this week</span><span className="text-xs font-semibold tabular-nums text-slate-900">₹{Number(data.quickStats?.thisWeekRevenue || 0).toLocaleString("en-IN")}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-600">Food orders</span><span className="text-xs font-semibold tabular-nums text-slate-900">{data.quickStats?.todaysFoodOrders || 0}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-600">Peak hour</span><span className="text-xs font-semibold text-slate-900">{data.quickStats?.peakHour || "—"}</span></div>
              </div>
              <Link href="/admin/reports" className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs font-semibold text-blue-800 hover:text-blue-900">View revenue reports <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Card>

            <Card className="rounded-lg border-slate-200 bg-white !p-3.5 !shadow-sm"><h2 className="mb-2 text-[13px] font-semibold text-slate-900">System status</h2><div className="space-y-1.5">{["Bookings", "Payments", "Food orders", "Database"].map((service) => <div key={service} className="flex items-center gap-2 text-[11px] text-slate-700"><Check className="h-3.5 w-3.5 text-emerald-700" />{service}<span className="ml-auto text-slate-600">Operational</span></div>)}</div></Card>
          </aside>
        </div>
      </main>
    </div>
  </div>;
}

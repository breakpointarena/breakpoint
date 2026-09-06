"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Calendar, Monitor, Utensils, Tag,
  PartyPopper, BarChart2, LogOut, ChevronLeft,
  User2Icon, Crown, Clock, Loader2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signOutAdmin } from "@/lib/auth/admin-signout";
import { supabase } from "@/lib/supabase/client";
import { getUserRole, type UserRole } from "@/lib/auth/roles";

const navItems = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Bookings", href: "/admin/bookings", icon: Calendar },
  { name: "Timeline", href: "/admin/timeline", icon: Clock },
  { name: "Devices", href: "/admin/devices", icon: Monitor },
  { name: "Food", href: "/admin/food", icon: Utensils },
  { name: "Customers", href: "/admin/customers", icon: User2Icon },
  { name: "Subscription", href: "/admin/subscription", icon: Crown },
  { name: "Promo Codes", href: "/admin/promo-code", icon: Tag },
  { name: "Happy Hours", href: "/admin/happy-hours", icon: PartyPopper },
  { name: "Reports", href: "/admin/reports", icon: BarChart2 },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function Sidebar({ isOpen, onToggle, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    // Get user role on mount
    getUserRole().then(setUserRole);
  }, []);

  // Filter nav items based on role
  const filteredNavItems = navItems.filter(item => {
    // Hide Reports if user is staff
    if (item.href === "/admin/reports" && userRole === "staff") {
      return false;
    }
    return true;
  });

  // Only dismiss the panel drawer on mobile devices (< 768px tailwind breakpoint)
  const handleNavigationClick = () => {
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      const { error } = await signOutAdmin();

      if (error) {
        toast.error('Logout Failed', {
          description: 'An error occurred while signing out',
        });
        setLoggingOut(false);
        return;
      }

      toast.success('Logged Out', {
        description: 'You have been signed out successfully',
      });

      // Close the drawer so it is not left open behind the login screen
      onClose();
      router.push('/admin/login');
      router.refresh();
    } catch (error) {
      toast.error('Logout Failed', {
        description: 'An unexpected error occurred',
      });
      setLoggingOut(false);
    }
  };

  return (
    <>
      {/* MOBILE OVERLAY DIMMER */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"
        />
      )}

      {/* RENDER SIDEBAR CONTAINER */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 md:sticky flex-shrink-0 bg-[var(--background)] border-r border-[#27272a] flex flex-col h-screen transition-all duration-300 ease-in-out scrollbar-none ${isOpen ? "w-[288px] translate-x-0" : "w-[80px] -translate-x-full md:translate-x-0"
          }`}
      >

        {/* BRAND LOGO AREA + INTEGRATED DESKTOP/MOBILE CONTROLLER */}
        <div
          className={`flex border-b border-[#27272a]/40 h-20 overflow-hidden ${isOpen
            ? "px-4 flex-row items-center justify-between gap-2"
            : "px-2 py-2 flex-col items-center justify-center gap-1"
            }`}
        >
          {isOpen ? (
            <div className="flex items-center gap-3 min-w-0 hover:scale-[1.02] transition-transform duration-300 cursor-pointer animate-in fade-in duration-300">
              <Image
                src="/bp_logo.png"
                alt="Breakpoint Arena"
                width={40}
                height={40}
                className="w-10 h-10 flex-shrink-0 object-contain rounded-md"
                loading="eager"
              />
              <div className="min-w-0">
                <h1 className="text-base font-black tracking-tight text-primary drop-shadow-[0_0_10px_rgba(184,134,11,0.3)] truncate leading-tight">
                  Break Point Arena
                </h1>
                <p className="text-xs text-[#a1a1aa] mt-0.5 font-medium truncate">Admin Panel</p>
              </div>
            </div>
          ) : (
            <Image
              src="/bp_logo.png"
              alt="BP"
              width={32}
              height={32}
              className="w-8 h-8 flex-shrink-0 object-contain rounded-md animate-in fade-in duration-300"
              loading="eager"
            />
          )}

          {/* DYNAMIC TOGGLE SWITCH BUTTON */}
          <button
            onClick={onToggle}
            className={`rounded-xl text-[#a1a1aa] hover:text-white hover:bg-[var(--surface-hover)] transition-all border border-transparent hover:border-[#27272a] flex-shrink-0 ${isOpen ? "p-2" : "p-1"
              }`}
            aria-label="Toggle Navigation Layout Menu"
          >
            <ChevronLeft
              className={`transition-transform duration-300 ${isOpen ? "h-5 w-5" : "h-4 w-4 rotate-180"}`}
            />
          </button>
        </div>

        {/* NAVIGATION LINKS CONTAINER */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-hidden">
          {filteredNavItems.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                /**
                 * No prefetching. All ten of these are in the viewport the
                 * moment the shell paints, and a prefetch is a real request to
                 * /admin/* - which the middleware matches, so each one costs a
                 * `supabase.auth.getUser()` round trip to the auth server before
                 * Next has even decided whether the operator will click it. Ten
                 * of those land together on every full load of the panel, at
                 * 270ms-1.4s each against production, competing with the
                 * dashboard's own auth check and queries for the same
                 * connection.
                 *
                 * The cost of turning it off is small here: these routes are
                 * statically rendered, so a click fetches a cheap payload, and
                 * the auth round trip it pays is one the real navigation owed
                 * anyway. Persistent nav is not content the operator is about to
                 * scroll into - it is ten guesses, of which at most one is right.
                 */
                prefetch={false}
                onClick={handleNavigationClick}
                title={!isOpen ? item.name : undefined}
              >
                <div
                  className={`flex items-center gap-3 py-3 rounded-xl transition-all duration-300 group animate-in slide-in-from-left-4 fade-in fill-mode-both ${isOpen ? "px-4" : "justify-center px-0 h-11 w-11 mx-auto"
                    } ${isActive
                      ? "bg-gradient-primary text-[var(--button-text)] font-bold glow-primary scale-[1.02]"
                      : "text-[#a1a1aa] hover:text-white hover:bg-[var(--surface-hover)] hover:translate-x-1"
                    }`}
                  style={{ animationDelay: `${index * 30 + 50}ms` }}
                >
                  <item.icon
                    className={`h-5 w-5 flex-shrink-0 transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-110 group-hover:rotate-6"
                      }`}
                  />
                  {isOpen && <span className="text-sm truncate animate-in fade-in duration-200">{item.name}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* LOGOUT AREA PANEL */}
        <div className="p-3 border-t border-[#27272a] overflow-hidden">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className={`flex items-center gap-3 py-3 rounded-xl text-[#ef4444] hover:bg-red-500/10 transition-all duration-300 group disabled:opacity-50 disabled:cursor-not-allowed ${isOpen ? "px-4 w-full" : "justify-center px-0 h-11 w-11 mx-auto"
              }`}
            title={!isOpen ? "Logout" : undefined}
          >
            {loggingOut ? (
              <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin" />
            ) : (
              <LogOut className="h-5 w-5 flex-shrink-0 group-hover:-translate-x-0.5 transition-transform" />
            )}
            {isOpen && (
              <span className="text-sm font-semibold animate-in fade-in duration-200">
                {loggingOut ? "Logging out..." : "Logout"}
              </span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
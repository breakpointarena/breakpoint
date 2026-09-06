"use client";

import { useState, useEffect } from "react";
import { Grid, Menu, LogOut, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signOutAdmin } from "@/lib/auth/admin-signout";
import { NotificationBell } from "./NotificationBell";
import { SoundSettings } from "./SoundSettings";
import { getAuthUser, roleFromUser, type UserRole } from "@/lib/auth/roles";

interface TopbarProps {
  onToggleSidebar?: () => void;
  onOpenSidebar: () => void;
}

export function Topbar({ onToggleSidebar, onOpenSidebar }: TopbarProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("Admin User");
  const [userRole, setUserRole] = useState<UserRole>(null);

  useEffect(() => {
    const getUser = async () => {
      /**
       * One lookup, not two. This used to call `getUser()` for the name and then
       * `getUserRole()` for the badge - and `getUserRole` reads the role off the
       * very same user object, so the second call was a whole extra round trip to
       * the auth server for something already in hand. Sequential, too, so the
       * in-flight sharing in `roles.ts` could not collapse them.
       */
      const user = await getAuthUser();

      if (user) {
        setUserEmail(user.email || "");
        // Extract name from email (before @) or use full name from metadata
        const displayName = user.user_metadata?.full_name ||
                           user.email?.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ||
                           "Admin User";
        setUserName(displayName);
      }

      setUserRole(roleFromUser(user));
    };
    getUser();
  }, []);

  const handleLogout = async () => {
    try {
      const { error } = await signOutAdmin();

      if (error) {
        toast.error('Logout Failed', {
          description: 'An error occurred while signing out',
        });
        return;
      }

      toast.success('Logged Out', {
        description: 'You have been signed out successfully',
      });

      router.push('/admin/login');
      router.refresh();
    } catch (error) {
      toast.error('Logout Failed', {
        description: 'An unexpected error occurred',
      });
    }
  };

  return (
    <header className="h-[72px] flex-shrink-0 bg-[var(--background)]/80 backdrop-blur-md border-b border-[#27272a] flex items-center justify-between px-4 md:px-8 animate-in slide-in-from-top-full duration-500 z-40">
      <div className="flex items-center gap-3 flex-1 max-w-md md:max-w-xl pr-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSidebar}
          className="text-white hover:bg-[var(--surface-hover)] md:hidden flex-shrink-0 h-9 w-9"
          aria-label="Open navigation sidebar menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Right Block: Actions Tray & Profile Widget */}
      <div className="flex items-center gap-3 md:gap-6 flex-shrink-0">
        
        {/* Action Quick Toggles Utilities */}
        <div className="flex items-center gap-2 md:gap-4 text-[#a1a1aa]">
          <NotificationBell />

          <SoundSettings />

          <button className="p-1 md:p-2 hover:text-white transition-all duration-300 group hover:rotate-90 hidden xs:block">
            <Grid className="h-5 w-5" />
          </button>
        </div>

        <div className="h-8 w-px bg-[#27272a]"></div>

        {/* Logout Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="text-muted-content hover:text-primary hover:bg-[var(--surface-hover)] transition-all duration-300 h-9 w-9"
          title="Logout"
        >
          <LogOut className="h-5 w-5" />
        </Button>

        <div className="h-8 w-px bg-[#27272a]"></div>

        {/* User Account Frame Section */}
        <div className="flex items-center gap-2 md:gap-3 cursor-pointer group select-none">
          <div className="text-right transition-transform duration-300 group-hover:-translate-x-0.5 hidden md:block">
            <div className="flex items-center gap-2 justify-end">
              <p className="text-sm font-bold text-white group-hover:text-primary transition-colors leading-tight">
                {userName}
              </p>
              {userRole && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                    userRole === 'admin'
                      ? 'bg-gradient-to-r from-primary/20 to-amber-500/20 text-primary border border-primary/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}
                  title={userRole === 'admin' ? 'Full access including Reports' : 'Limited access - no Reports'}
                >
                  {userRole === 'admin' ? <Shield className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                  {userRole}
                </span>
              )}
            </div>
            <p className="text-xs text-[#a1a1aa] tracking-wide mt-0.5 leading-none truncate max-w-[160px]" title={userEmail}>
              {userEmail || "Arena Manager"}
            </p>
          </div>

          {/* Profile Circle Avatar Frame */}
          <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-[#27272a] border-2 border-transparent group-hover:border-primary group-hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all duration-300 overflow-hidden transform group-hover:scale-105">
            <img
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userName}&backgroundColor=A855F7`}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

      </div>
    </header>
  );
}
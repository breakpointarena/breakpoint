"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import OTPVerification from "@/components/auth/OTPVerification";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { getCustomerHeaderStateShared } from "@/lib/auth/customer-session-client";
import {
  sendOTPAction,
  verifyOTPAction,
  resendOTPAction,
} from "@/app/(customer)/booking/otp-actions";

/**
 * Phone verification in front of anything that shows or changes a customer's
 * own records.
 *
 * The booking and food checkout screens verify inline, because entering the
 * number is already part of those forms. Pages that only *read* a customer's
 * history have no such form, so they get this instead - one component, so
 * "log in" means the same thing everywhere.
 *
 * Children receive the verified number. They should still scope their own
 * queries by the session server-side; this gate is what the customer sees, not
 * what protects the data.
 */
interface CustomerAuthGateProps {
  title?: string;
  description?: string;
  children: (verifiedPhone: string) => React.ReactNode;
}

export function CustomerAuthGate({
  title = "Verify Your Mobile Number",
  description = "We'll text you a one-time code to confirm it's you.",
  children,
}: CustomerAuthGateProps) {
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [checking, setChecking] = useState(true);
  const [showOtp, setShowOtp] = useState(false);

  // A live session skips the gate entirely, so moving between pages inside the
  // session window does not ask for a code each time.
  useEffect(() => {
    let cancelled = false;

    /**
     * Shared with the navbar's account control, which asks the very same
     * question in the very same tick. Both used to send their own request and
     * validate the same cookie separately; the helper collapses simultaneous
     * callers onto one in-flight lookup without caching the answer.
     */
    getCustomerHeaderStateShared()
      .then((session) => {
        if (cancelled) return;
        if (session.phone) {
          setVerifiedPhone(session.phone);
          setPhone(session.phone);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (phone.trim().length !== 10) {
        toast.error("Invalid Number", {
          description: "Please enter a valid 10-digit mobile number.",
        });
        return;
      }
      setShowOtp(true);
    },
    [phone]
  );

  if (checking) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BreakpointLoader size="lg" text="Checking your session..." />
      </div>
    );
  }

  if (verifiedPhone) {
    return <>{children(verifiedPhone)}</>;
  }

  if (showOtp) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <OTPVerification
          phone={phone}
          onVerified={(confirmed) => setVerifiedPhone(confirmed)}
          onBack={() => setShowOtp(false)}
          onSendOTP={sendOTPAction}
          onVerifyOTP={verifyOTPAction}
          onResendOTP={resendOTPAction}
        />
      </div>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-[#111] via-[#0f0f0f] to-[#111] border-2 border-primary/30 p-8 rounded-2xl max-w-md mx-auto animate-in fade-in zoom-in duration-500">
      <div className="flex flex-col items-center text-center space-y-2 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-2">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-black uppercase text-white tracking-tight">{title}</h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label
            htmlFor="auth-phone"
            className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2"
          >
            <Phone className="h-3.5 w-3.5 text-primary" />
            Mobile Number <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-zinc-600 border-r border-zinc-800 pr-3">
              +91
            </span>
            <Input
              id="auth-phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter 10-digit number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              className="bg-zinc-950/50 border-2 border-zinc-800 focus:border-primary h-14 pl-[60px] sm:pl-16 text-base text-white font-mono rounded-xl"
            />
          </div>
        </div>

        <Button
          type="submit"
          variant="gradient"
          disabled={phone.trim().length !== 10}
          className="w-full h-12 rounded-xl text-xs font-black uppercase tracking-wider text-black"
        >
          Send Verification Code
        </Button>
      </form>
    </Card>
  );
}

export default CustomerAuthGate;

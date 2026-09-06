"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { notifyCustomerSessionChanged } from "@/lib/auth/customer-session-client";

interface OTPVerificationProps {
  phone: string;
  onVerified: (phone: string) => void;
  onBack?: () => void;
  onSendOTP: (phone: string) => Promise<{ success: boolean; message: string; sessionId?: string }>;
  onVerifyOTP: (phone: string, otp: string) => Promise<{ success: boolean; message: string }>;
  onResendOTP: (phone: string) => Promise<{ success: boolean; message: string }>;
  autoSendOnMount?: boolean;
}

export default function OTPVerification({
  phone,
  onVerified,
  onBack,
  onSendOTP,
  onVerifyOTP,
  onResendOTP,
  autoSendOnMount = true,
}: OTPVerificationProps) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [otpSent, setOtpSent] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  /**
   * Whether the automatic send has already been fired for this mount.
   *
   * The guard used to be `!otpSent`, read from a closure the effect never
   * refreshed, so it could not see a send that was still in flight. Two codes
   * then went out for one arrival: two paid credits, and the second retired the
   * first, so a customer typing the code that reached them first was told it was
   * invalid. A ref settles synchronously, before any state has committed.
   */
  const autoSendFired = useRef(false);

  // Auto-send OTP on mount
  useEffect(() => {
    if (autoSendOnMount && !autoSendFired.current) {
      autoSendFired.current = true;
      handleSendOTP();
    }
  }, [autoSendOnMount]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0 && otpSent) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
  }, [resendTimer, otpSent]);

  /**
   * Every handler below wraps its server call.
   *
   * They used to await the action bare. A server function that rejects rather
   * than returns - a dropped connection, a 500, a deployment id that has moved
   * on - skipped the `setIsSending(false)` that followed it, so the button sat
   * on "Sending OTP..." for ever with no error shown and nothing to click. The
   * reset belongs in a `finally` for exactly that reason.
   */
  const handleSendOTP = async () => {
    if (isSending) return;
    setIsSending(true);

    try {
      const result = await onSendOTP(phone);

      if (result.success) {
        setOtpSent(true);
        setCanResend(false);
        setResendTimer(60);
        toast.success("OTP Sent", { description: result.message });
        // Focus first input
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      } else {
        toast.error("Failed to Send OTP", { description: result.message });
      }
    } catch (error) {
      console.error("[OTP] send request did not complete:", error);
      toast.error("Failed to Send OTP", {
        description: "We could not reach the server. Please check your connection and try again.",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleResendOTP = async () => {
    if (isSending) return;
    setIsSending(true);
    setOtp(["", "", "", "", "", ""]);

    try {
      const result = await onResendOTP(phone);

      if (result.success) {
        setCanResend(false);
        setResendTimer(60);
        toast.success("OTP Resent", { description: result.message });
        inputRefs.current[0]?.focus();
      } else {
        toast.error("Failed to Resend", { description: result.message });
      }
    } catch (error) {
      console.error("[OTP] resend request did not complete:", error);
      toast.error("Failed to Resend", {
        description: "We could not reach the server. Please check your connection and try again.",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleOTPChange = (index: number, value: string) => {
    // Only allow digits
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Take only last character
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all 6 digits are entered
    if (newOtp.every((digit) => digit !== "") && !isVerifying) {
      handleVerifyOTP(newOtp.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);
    if (!/^\d+$/.test(pastedData)) return;

    const newOtp = pastedData.split("").concat(Array(6).fill("")).slice(0, 6);
    setOtp(newOtp);

    // Focus last filled input or verify if complete
    const lastFilledIndex = pastedData.length - 1;
    if (lastFilledIndex < 5) {
      inputRefs.current[lastFilledIndex + 1]?.focus();
    } else {
      handleVerifyOTP(newOtp.join(""));
    }
  };

  const handleVerifyOTP = async (otpCode?: string) => {
    const code = otpCode || otp.join("");

    if (code.length !== 6) {
      toast.error("Invalid OTP", { description: "Please enter all 6 digits" });
      return;
    }

    setIsVerifying(true);

    try {
      const result = await onVerifyOTP(phone, code);

      // No token here by design - it is set server-side as an httpOnly cookie, so
      // this component never handles a credential.
      if (result.success) {
        /**
         * Announced here rather than in each caller.
         *
         * This is the one component every customer login goes through - the
         * booking form, the food checkout, the subscription page and the gate in
         * front of /retrieve and /my-subscription all mount it - and none of
         * them navigates on success. Telling the rest of the app from this one
         * place means the navbar shows the customer's membership the moment they
         * verify, and a login surface added later cannot forget to do it.
         *
         * Before `onVerified`, so anything that re-reads the session in response
         * to that callback is already looking at the new one.
         */
        notifyCustomerSessionChanged();

        toast.success("Verified!", { description: "Phone number verified successfully" });
        onVerified(phone);
      } else {
        toast.error("Verification Failed", { description: result.message });
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch (error) {
      // Same reason as the send handlers: a rejected server call must not leave
      // the boxes disabled behind a spinner that never stops.
      console.error("[OTP] verify request did not complete:", error);
      toast.error("Verification Failed", {
        description: "We could not reach the server. Please check your connection and try again.",
      });
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  const formatPhone = (phone: string) => {
    const clean = phone.replace(/^\+?91/, "");
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <Card className="bg-[#111] border border-zinc-900 p-6 md:p-8 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black uppercase text-white tracking-tight">VERIFY YOUR NUMBER</h3>
            <p className="text-sm text-zinc-400">
              {otpSent
                ? `Enter the 6-digit OTP sent to ${formatPhone(phone)}`
                : "We'll send you a one-time password"}
            </p>
          </div>
        </div>

        {/* OTP Input */}
        {otpSent && (
          <div className="space-y-4">
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  // Braced: React 19 ref callbacks must return void (a returned
                  // value is treated as a cleanup function).
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOTPChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={isVerifying || isSending}
                  className="w-12 h-14 text-center text-2xl font-black bg-zinc-950 border-zinc-800 focus:border-primary focus-visible:ring-primary text-white rounded-xl"
                />
              ))}
            </div>

            {/* Status Messages */}
            {isVerifying && (
              <div className="flex items-center justify-center gap-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="font-bold">Verifying...</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {!otpSent ? (
            <Button
              onClick={handleSendOTP}
              disabled={isSending}
              variant="gradient"
              className="w-full text-black font-black uppercase text-xs h-12 rounded-xl"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending OTP...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Send OTP
                </>
              )}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => handleVerifyOTP()}
                disabled={otp.some((d) => !d) || isVerifying}
                variant="gradient"
                className="w-full text-black font-black uppercase text-xs h-12 rounded-xl"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Verify OTP
                  </>
                )}
              </Button>

              {/* Resend OTP */}
              <div className="text-center space-y-2">
                {canResend ? (
                  <Button
                    onClick={handleResendOTP}
                    disabled={isSending}
                    variant="ghost"
                    className="text-primary hover:text-primary font-bold text-xs uppercase"
                  >
                    {isSending ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-2" />
                    )}
                    Resend OTP
                  </Button>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Resend OTP in{" "}
                    <span className="text-primary font-black font-mono">{resendTimer}s</span>
                  </p>
                )}
              </div>
            </>
          )}

          {/* Back Button */}
          {onBack && (
            <Button
              onClick={onBack}
              variant="ghost"
              className="w-full text-zinc-400 hover:text-white border border-zinc-800 font-bold uppercase text-xs h-10 rounded-xl"
            >
              ← Change Number
            </Button>
          )}
        </div>

        {/* Footer Note */}
        <div className="pt-2 flex gap-2 items-center text-[10px] text-zinc-600 justify-center border-t border-zinc-950">
          <ShieldCheck className="h-3.5 w-3.5 text-zinc-700" />
          <span>Your phone number is secured with 15-minute session validity</span>
        </div>
      </Card>

      {/* Help Text */}
      <div className="text-center">
        <p className="text-xs text-zinc-600">
          Didn't receive the OTP? Check your SMS or wait {resendTimer > 0 ? `${resendTimer}s` : ""} to resend
        </p>
      </div>
    </div>
  );
}

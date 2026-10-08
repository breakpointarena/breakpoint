"use client";

import { useState, useEffect, useMemo } from "react";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setCustomerDetails, setSubscription, setPricing, resetBooking, clearSlotTimer, setPromoCode, releaseSlotHold } from "@/lib/redux/slices/bookingSlice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Phone, ChevronRight, User, Mail, CheckCircle2, QrCode, Cake, UtensilsCrossed, Tag, Loader2, Sparkles } from 'lucide-react';
import { toast } from "sonner";
import { checkCustomerExists, releaseSlotHold as releaseSlotHoldOnServer } from "../actions";
import { createDeviceBookingPaymentOrder, confirmDeviceBookingPayment } from "../payment-actions";
import {
  openRazorpayCheckout,
  loadRazorpayCheckout,
  RazorpayDismissedError,
  RazorpayFailedError,
} from "@/lib/razorpay/checkout";
import { validatePromoCode, calculatePromoDiscount } from "../promo-actions";
import { sendOTPAction, verifyOTPAction, resendOTPAction, checkActiveSessionAction } from "../otp-actions";
import { QRCodeSVG } from "qrcode.react";
import { generateDurationOptions, crossesMidnight, bookingEndDate } from "@/lib/utils/timeSlots";
import { formatDateForDB, formatDateForDisplay, handleDobInput, isValidDob, DOB_ERROR } from "@/lib/utils/dates";
import { allFilled, isPlausibleEmail } from "@/lib/utils/forms";
import { deviceCharge, extraPlayersCharge, perExtraPlayerCharge, round2 } from "@/lib/payments/money";
import OTPVerification from "@/components/auth/OTPVerification";

type Step = "phone" | "otp" | "details" | "summary" | "success";

export default function CustomerDetailsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const bookingState = useAppSelector((state) => state.booking);
  const { deviceTypeName, selectedSlot, deviceTypeId, selectedDate, slotStartTime, slotEndTime, selectedDuration, hourlyRate, addons, subtotal, playerCount, includedPlayers, extraPlayerCharge } = bookingState;

  const [step, setStep] = useState<Step>("phone");
  const [mobileNumber, setMobileNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerDob, setCustomerDob] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerExists, setCustomerExists] = useState(false);
  const [existingCustomerData, setExistingCustomerData] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [resumingSession, setResumingSession] = useState(true);
  const [bookingNumber, setBookingNumber] = useState<string>("");
  const [bookingId, setBookingId] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  // Authoritative breakdown returned by the pricing server action. Once we have
  // it, it wins over anything computed on this screen.
  const [serverSummary, setServerSummary] = useState<{
    deviceSubtotal: number;
    addonsTotal: number;
    subscriptionDiscount: number;
    promoDiscount: number;
    happyHourDiscount: number;
    happyHourRuleName: string | null;
    totalAmount: number;
  } | null>(null);
  const [promoCode, setPromoCodeInput] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const allDurations = useMemo(() => generateDurationOptions(), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * Resume an existing login instead of asking for the number again.
   *
   * The session check used to run only after the customer typed their number
   * and pressed continue, so someone already signed in was still made to enter
   * it - the session spared them the OTP but not the typing. Checking on mount
   * takes a signed-in customer straight to their booking summary.
   */
  useEffect(() => {
    let cancelled = false;

    checkActiveSessionAction()
      .then(async (session) => {
        if (cancelled || !session.isValid || !session.phone) return;
        setMobileNumber(session.phone);
        await proceedAfterPhoneVerification(session.phone);
      })
      .finally(() => {
        if (!cancelled) setResumingSession(false);
      });

    return () => {
      cancelled = true;
    };
    // Mount-only: resuming once is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Force scroll to top on mount and step changes to prevent landing at the bottom/footer
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.body.scrollTop = 0;
      if (document.documentElement) {
        document.documentElement.scrollTop = 0;
      }
    }
  }, [step]);

  // Warm up the Razorpay SDK once the customer reaches the summary, so tapping
  // "Pay & Confirm" opens the checkout immediately.
  useEffect(() => {
    if (step === "summary") {
      loadRazorpayCheckout().catch(() => {
        /* Surfaced on the pay attempt instead of interrupting the summary. */
      });
    }
  }, [step]);

  /**
   * The date a booking that runs past midnight actually ends on.
   *
   * Null when it finishes the same day, so the summary only mentions a second
   * date when there genuinely is one.
   */
  const sessionEndDate = useMemo(() => {
    if (!selectedDate || !slotStartTime || !selectedDuration) return null;
    if (!crossesMidnight(slotStartTime, selectedDuration)) return null;
    return bookingEndDate(new Date(selectedDate), slotStartTime, selectedDuration);
  }, [selectedDate, slotStartTime, selectedDuration]);

  const selectedDurationLabel = useMemo(() => {
    const duration = allDurations.find(d => d.value === selectedDuration);
    return duration?.label || (selectedDuration ? `${selectedDuration} mins` : "--");
  }, [selectedDuration, allDurations]);

  // The price this screen is showing. The server re-prices independently before
  // charging anything; this exists so we can compare the two and never charge a
  // number the customer was not shown.
  const displayedPricing = useMemo(() => {
    let durationInHours = 0;

    if (selectedDuration && selectedDuration > 0) {
      durationInHours = selectedDuration / 60;
    } else if (slotStartTime && slotEndTime) {
      const parseTime = (timeStr: string) => {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return 0;
        const [, hours, minutes, period] = match;
        let hour = parseInt(hours);
        if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
        if (period.toUpperCase() === "AM" && hour === 12) hour = 0;
        return hour * 60 + parseInt(minutes);
      };
      durationInHours = (parseTime(slotEndTime) - parseTime(slotStartTime)) / 60;
    }

    const deviceCharges = deviceCharge(hourlyRate || 0, durationInHours);
    const extraPlayerCharges = extraPlayersCharge(
      Math.max(0, playerCount - includedPlayers),
      extraPlayerCharge,
      durationInHours
    );
    const addonsTotal = addons.reduce((sum, addon) => sum + addon.price * addon.quantity, 0);
    const subtotalAmount = deviceCharges + extraPlayerCharges + addonsTotal;
    const total =
      subtotalAmount -
      bookingState.subscriptionDiscount -
      bookingState.promoDiscount -
      bookingState.happyHourDiscount;

    return {
      durationInHours,
      deviceCharges,
      extraPlayerCharges,
      addonsTotal,
      subtotal: subtotalAmount,
      total,
    };
  }, [
    selectedDuration,
    slotStartTime,
    slotEndTime,
    hourlyRate,
    playerCount,
    includedPlayers,
    extraPlayerCharge,
    addons,
    bookingState.subscriptionDiscount,
    bookingState.promoDiscount,
    bookingState.happyHourDiscount,
  ]);

  // What the customer is actually shown. Line items stay as computed here (they
  // come from the same rates the server uses), but discounts and the total defer
  // to the server the moment it has told us what it will charge.
  const effectivePricing = useMemo(() => {
    if (!serverSummary) {
      return {
        ...displayedPricing,
        subscriptionDiscount: bookingState.subscriptionDiscount,
        promoDiscount: bookingState.promoDiscount,
        happyHourDiscount: bookingState.happyHourDiscount,
        happyHourRuleName: bookingState.happyHourRuleName,
        isServerPriced: false,
      };
    }

    return {
      ...displayedPricing,
      addonsTotal: serverSummary.addonsTotal,
      subtotal: serverSummary.deviceSubtotal + serverSummary.addonsTotal,
      total: serverSummary.totalAmount,
      subscriptionDiscount: serverSummary.subscriptionDiscount,
      promoDiscount: serverSummary.promoDiscount,
      happyHourDiscount: serverSummary.happyHourDiscount,
      happyHourRuleName: serverSummary.happyHourRuleName,
      isServerPriced: true,
    };
  }, [
    displayedPricing,
    serverSummary,
    bookingState.subscriptionDiscount,
    bookingState.promoDiscount,
    bookingState.happyHourDiscount,
    bookingState.happyHourRuleName,
  ]);

  // Gates the registration submit: every starred field must be filled before the
  // button becomes usable.
  const detailsComplete =
    allFilled(customerName, customerDob) &&
    customerDob.length === 10 &&
    isPlausibleEmail(customerEmail);

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = handleDobInput(e.target.value);
    setCustomerDob(formatted);
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mobileNumber.trim()) {
      toast.error("Required Field Missing", { description: "Please provide your mobile number to continue." });
      return;
    }

    if (mobileNumber.length < 10) {
      toast.error("Invalid Number", { description: "Please enter a valid 10-digit mobile number." });
      return;
    }

    setIsSubmitting(true);

    // Does THIS browser already hold a verified session?
    const sessionCheck = await checkActiveSessionAction();

    // Skip OTP only when the live session belongs to the number being entered.
    // A session for one number must never wave through a booking for another.
    if (sessionCheck.isValid && sessionCheck.phone === mobileNumber) {
      toast.success("Session Active", { description: "Welcome back! Your session is still active." });
      await proceedAfterPhoneVerification(mobileNumber);
    } else {
      setStep("otp");
    }

    setIsSubmitting(false);
  };

  const proceedAfterPhoneVerification = async (phone: string) => {
    // Check if customer exists
    const result = await checkCustomerExists(phone);

    if (result.exists && result.customer) {
      // Customer exists, skip to summary
      setCustomerExists(true);
      setExistingCustomerData(result.customer);
      setCustomerName(result.customer.name);
      setCustomerEmail(result.customer.email || "");
      // Convert DOB from DB format (YYYY-MM-DD) to display format (DD-MM-YYYY)
      if (result.customer.date_of_birth) {
        setCustomerDob(formatDateForDisplay(result.customer.date_of_birth));
      }

      dispatch(setCustomerDetails({
        phone: phone,
        name: result.customer.name,
        email: result.customer.email || "",
        date_of_birth: result.customer.date_of_birth
      }));

      // Set subscription if customer has active subscription
      if (result.subscription) {
        dispatch(setSubscription({
          id: result.subscription.id,
          planName: result.subscription.plan_name,
          discountPercentage: result.subscription.discount_percentage,
          endDate: result.subscription.end_date
        }));

        // Calculate subscription discount on device + extra players only (NOT food/addons)
        const durationInHours = (selectedDuration || 60) / 60;
        const deviceCharges = deviceCharge(hourlyRate || 0, durationInHours);
        const extraPlayerCharges = extraPlayersCharge(playerCount - includedPlayers, extraPlayerCharge, durationInHours);
        const discountableAmount = deviceCharges + extraPlayerCharges;

        const discountAmount = round2(
          (discountableAmount * result.subscription.discount_percentage) / 100
        );
        const newTotal = round2(subtotal - discountAmount - bookingState.happyHourDiscount);

        dispatch(setPricing({
          subtotal,
          subscriptionDiscount: discountAmount,
          promoDiscount: 0,
          happyHourDiscount: bookingState.happyHourDiscount,
          total: newTotal
        }));

        toast.success("Welcome back!", {
          description: `Hey ${result.customer.name}! Your ${result.subscription.plan_name} is active (${result.subscription.discount_percentage}% off)`
        });
      } else {
        dispatch(setSubscription(null));
        toast.success("Welcome back!", { description: `Hey ${result.customer.name}! We found your profile.` });
      }

      setStep("summary");
    } else {
      // New customer, ask for details
      toast.info("New Customer", { description: "Please provide your name and email." });
      setStep("details");
    }
  };

  const handleOTPVerified = async (verifiedPhone: string) => {
    await proceedAfterPhoneVerification(verifiedPhone);
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      toast.error("Required Field Missing", { description: "Please provide your name." });
      return;
    }

    // Validate DOB
    if (!customerDob.trim()) {
      toast.error("Required Field Missing", { description: "Please provide your date of birth." });
      return;
    }

    // isValidDob covers both the DD-MM-YYYY shape and the accepted year range.
    if (!isValidDob(customerDob)) {
      toast.error(DOB_ERROR);
      return;
    }

    const formattedDob = formatDateForDB(customerDob);
    if (!formattedDob) {
      toast.error("Invalid Date", { description: "Please check the date format." });
      return;
    }

    dispatch(setCustomerDetails({
      phone: mobileNumber,
      name: customerName,
      email: customerEmail,
      date_of_birth: formattedDob,
    }));

    toast.success("Details Saved", { description: "Review your booking summary." });
    setStep("summary");
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) {
      toast.error("Please enter a promo code");
      return;
    }

    setIsApplyingPromo(true);
    const result = await validatePromoCode(promoCode);

    if (result.success && result.promo) {
      // Calculate discountable amount (device + extra players, NOT food)
      let durationInHours = 0;
      if (selectedDuration && selectedDuration > 0) {
        durationInHours = selectedDuration / 60;
      } else if (slotStartTime && slotEndTime) {
        const parseTime = (timeStr: string) => {
          const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (!match) return 0;
          let [, hours, minutes, period] = match;
          let hour = parseInt(hours);
          if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
          if (period.toUpperCase() === "AM" && hour === 12) hour = 0;
          return hour * 60 + parseInt(minutes);
        };
        const startMins = parseTime(slotStartTime);
        const endMins = parseTime(slotEndTime);
        durationInHours = (endMins - startMins) / 60;
      }

      const deviceCharges = deviceCharge(hourlyRate || 0, durationInHours);
      const extraPlayerCharges = extraPlayersCharge(playerCount - includedPlayers, extraPlayerCharge, durationInHours);
      const discountableAmount = deviceCharges + extraPlayerCharges; // NOT food

      const discount = await calculatePromoDiscount(
        discountableAmount,
        result.promo.discount_type,
        result.promo.discount_value
      );

      const addonsTotal = addons.reduce((sum, addon) => sum + (addon.price * addon.quantity), 0);
      const calculatedSubtotal = deviceCharges + extraPlayerCharges + addonsTotal;
      const calculatedTotal = round2(
        calculatedSubtotal - bookingState.subscriptionDiscount - discount - bookingState.happyHourDiscount
      );

      dispatch(setPricing({
        subtotal: calculatedSubtotal,
        subscriptionDiscount: bookingState.subscriptionDiscount,
        promoDiscount: discount,
        happyHourDiscount: bookingState.happyHourDiscount,
        total: calculatedTotal,
      }));
      dispatch(setPromoCode(result.promo.code));
      toast.success("Promo code applied!", {
        description: `You saved ₹${discount.toFixed(2)} with code ${result.promo.code}`
      });
    } else {
      toast.error(result.error || "Invalid promo code");
    }
    setIsApplyingPromo(false);
  };

  const handleRemovePromo = () => {
    // Recalculate without promo
    let durationInHours = 0;
    if (selectedDuration && selectedDuration > 0) {
      durationInHours = selectedDuration / 60;
    } else if (slotStartTime && slotEndTime) {
      const parseTime = (timeStr: string) => {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return 0;
        let [, hours, minutes, period] = match;
        let hour = parseInt(hours);
        if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
        if (period.toUpperCase() === "AM" && hour === 12) hour = 0;
        return hour * 60 + parseInt(minutes);
      };
      const startMins = parseTime(slotStartTime);
      const endMins = parseTime(slotEndTime);
      durationInHours = (endMins - startMins) / 60;
    }

    const deviceCharges = deviceCharge(hourlyRate || 0, durationInHours);
    const extraPlayerCharges = extraPlayersCharge(playerCount - includedPlayers, extraPlayerCharge, durationInHours);
    const addonsTotal = addons.reduce((sum, addon) => sum + (addon.price * addon.quantity), 0);
    const calculatedSubtotal = deviceCharges + extraPlayerCharges + addonsTotal;
    const calculatedTotal = calculatedSubtotal - bookingState.subscriptionDiscount - bookingState.happyHourDiscount;

    dispatch(setPricing({
      subtotal: calculatedSubtotal,
      subscriptionDiscount: bookingState.subscriptionDiscount,
      promoDiscount: 0,
      happyHourDiscount: bookingState.happyHourDiscount,
      total: calculatedTotal,
    }));
    dispatch(setPromoCode(null));
    setPromoCodeInput("");
    toast.info("Promo code removed");
  };

  const showBookingSuccess = (
    resultBookingNumber: string,
    resultBookingId: string,
    paid: number
  ) => {
    setBookingNumber(resultBookingNumber);
    setBookingId(resultBookingId);
    setAmountPaid(paid);
    dispatch(clearSlotTimer()); // Clear timer and booking state after successful confirmation
    setStep("success");
  };

  const handleConfirmBooking = async () => {
    setIsSubmitting(true);

    // Format DOB for database
    let dobForDB = "";
    if (customerDob) {
      dobForDB = formatDateForDB(customerDob);
    } else if (existingCustomerData?.date_of_birth) {
      dobForDB = existingCustomerData.date_of_birth;
    }

    try {
      // The server re-prices the booking from the database; the amount charged
      // never comes from this screen.
      const order = await createDeviceBookingPaymentOrder({
        phone: mobileNumber,
        name: customerName || existingCustomerData?.name,
        email: customerEmail || existingCustomerData?.email || "",
        dateOfBirth: dobForDB,
        deviceTypeId: deviceTypeId!,
        selectedDate: selectedDate!,
        slotStartTime: slotStartTime!,
        durationMinutes: selectedDuration || 60,
        playerCount: playerCount,
        addons: addons.map((addon) => ({ id: addon.id, quantity: addon.quantity })),
        promoCode: bookingState.promoCode,
        // The reservation taken on the slot picker. The server re-checks it; if it
        // has lapsed the booking still goes through, it just competes for the
        // station again instead of converting one already held.
        holdBookingId: bookingState.bookingId,
        holdToken: bookingState.holdToken,
      });

      if (!order.success) {
        // Session lapsed mid-checkout - send them back to verify rather than
        // leaving a dead error on a screen they cannot advance from.
        if (order.verificationRequired) {
          toast.error("Verification Needed", { description: order.error });
          setStep("otp");
          return;
        }
        toast.error("Booking Failed", {
          description: order.error || "Something went wrong. Please try again.",
        });
        return;
      }

      if (order.summary) {
        setServerSummary(order.summary);
      }

      // Nothing left to pay after discounts - the booking is already created.
      if (order.freeBooking) {
        toast.success("Booking Confirmed!", { description: "Your slot has been reserved successfully." });
        showBookingSuccess(order.bookingNumber || "", order.bookingId || "", 0);
        return;
      }

      // The server prices independently, so it can legitimately disagree with
      // this screen - an expired promo, a rate change, a happy hour that just
      // ended. Never open checkout on a number the customer has not seen: show
      // them the corrected breakdown and let them decide to pay it.
      if (
        order.summary &&
        Math.abs(order.summary.totalAmount - displayedPricing.total) > 0.01
      ) {
        toast.warning("Price Updated", {
          description: `This booking now comes to ₹${order.summary.totalAmount.toFixed(
            2
          )}. Please review and confirm.`,
        });
        return;
      }

      const response = await openRazorpayCheckout({
        keyId: order.keyId!,
        orderId: order.orderId!,
        amount: order.amount!,
        name: "Break Point Arena",
        description: `${deviceTypeName || "Gaming Session"} • ${selectedSlot || ""}`.trim(),
        prefill: {
          name: customerName || existingCustomerData?.name || "",
          email: customerEmail || existingCustomerData?.email || "",
          contact: mobileNumber,
        },
      });

      const confirmed = await confirmDeviceBookingPayment(response);

      if (confirmed.success) {
        toast.success("Payment Successful!", { description: "Your slot has been reserved." });
        showBookingSuccess(
          confirmed.bookingNumber || "",
          confirmed.bookingId || "",
          confirmed.amountPaid ?? order.amount ?? 0
        );
      } else {
        toast.error("Booking Failed", {
          description: confirmed.error || "Something went wrong. Please contact support.",
        });
      }
    } catch (err) {
      if (err instanceof RazorpayDismissedError) {
        toast.info("Payment Cancelled", { description: "Your slot has not been booked." });
      } else if (err instanceof RazorpayFailedError) {
        toast.error("Payment Failed", { description: err.message });
      } else {
        toast.error("Payment Error", {
          description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewBooking = () => {
    dispatch(resetBooking());
    router.push("/booking");
  };

  /**
   * Going back to pick again hands the station back straight away.
   *
   * The hold would lapse on its own within ten minutes, but releasing it here is
   * what lets the next customer book this station in the seconds after this one
   * walks away from it - which is the difference between a slot being free and a
   * slot looking taken to everybody else for the rest of the countdown.
   */
  const handleChooseAnotherSlot = () => {
    const { bookingId: heldBookingId, holdToken: heldToken } = bookingState;
    if (heldBookingId && heldToken) {
      // Fire and forget: the customer should not wait on this, and a hold that
      // fails to release simply lapses.
      void releaseSlotHoldOnServer(heldBookingId, heldToken);
    }
    dispatch(releaseSlotHold());
    router.push("/booking/slots-v2");
  };

  if (!mounted) return null;

  // Held until the session check settles, so an already-signed-in customer
  // never sees the phone form flash up before being moved past it.
  if (resumingSession) {
    return (
      <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center py-24">
        <BreakpointLoader size="lg" text="Checking your session..." />
      </div>
    );
  }

  // Phone Step UI
  if (step === "phone") {
    return (
      <div className="w-full max-w-xl mx-auto py-4 px-2 animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Timeline Step Indicator HUD Tracks */}
        <div className="w-full max-w-xs mx-auto flex items-center justify-between pb-8 select-none">
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-[11px] flex items-center justify-center">1</div><span className="text-xs font-black uppercase text-zinc-400 tracking-wider">Time Slot</span></div>
          <div className="h-0.5 bg-primary flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">2</div><span className="text-xs font-black uppercase text-primary tracking-wider">Details</span></div>
          <div className="h-0.5 bg-zinc-800 flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-zinc-900 text-zinc-400 font-bold text-[11px] flex items-center justify-center border border-zinc-800">3</div><span className="text-xs font-black uppercase text-zinc-400 tracking-wider">Payment</span></div>
        </div>

        <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">

          {/* Card Header Content Panels **/}
          <div className="border-b border-zinc-900 pb-4 space-y-1">
            <h3 className="text-lg font-black uppercase text-white tracking-tight">CUSTOMER IDENTIFICATION</h3>
            <p className="text-xs text-zinc-400 font-medium">Enter your mobile number to continue with booking.</p>
          </div>

          {/* Live Active Hold Summary Strip */}
          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-900 grid grid-cols-2 gap-2 text-xs glow-box-hover">
            <div className="space-y-0.5"><span className="text-[11px] font-black text-zinc-400 uppercase block">Selected Setup</span><span className="text-white font-black text-left break-words leading-tight max-w-[200px] block uppercase">{deviceTypeName || "PLAYSTATION 5"}</span></div>
            <div className="space-y-0.5 text-right"><span className="text-[11px] font-black text-zinc-400 uppercase block">Reserved Slot</span><span className="text-primary text-[12px] text-right font-black">{selectedSlot || "Pending Hold"}</span></div>
          </div>

          {/* Form Inputs Fields Element Column */}
          <form onSubmit={handlePhoneSubmit} className="space-y-4">

            {/* Contact Mobile Input Box */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5"><Phone className="h-3 w-3 text-zinc-600" /> MOBILE NUMBER <span className="text-red-500">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-400 border-r border-zinc-900 pr-2">+91</span>
                <Input
                  id="phone"
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="Enter 10-digit phone number"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))}
                  className="bg-zinc-950 border-zinc-900 h-12 pl-12 text-sm text-white focus-visible:ring-primary font-mono tracking-wide"
                />
              </div>
            </div>

            {/* Action Call buttons */}
            <div className="pt-4 space-y-2">
              <Button variant="gradient" type="submit" disabled={isSubmitting || mobileNumber.trim().length < 10} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-1.5 shadow-xl transition-all active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : "CONTINUE"} <ChevronRight className="h-4 w-4 stroke-[3]" />
              </Button>

              {/* Go to the slot picker explicitly. router.back() followed history, so
                  a customer who arrived any other way - a refresh, a deep link, a
                  redirect after the hold lapsed - landed on device selection or left
                  the flow entirely instead of choosing another time. */}
              <Button type="button" onClick={handleChooseAnotherSlot} variant="ghost" className="w-full border border-zinc-900 text-zinc-400 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl">
                ← CHOOSE ALTERNATIVE TIME SLOT
              </Button>
            </div>
          </form>

          {/* Security Shield Disclaimer Notice Footer */}
          <div className="pt-2 flex gap-2 items-center text-xs text-zinc-400 justify-center select-none border-t border-zinc-950">
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-700" />
            <span>Your data is stored securely. OTP verification required.</span>
          </div>
        </Card>
      </div>
    );
  }

  // OTP Verification Step
  if (step === "otp") {
    return (
      <div className="w-full max-w-xl mx-auto py-4 px-2">
        {/* Timeline Step Indicator */}
        <div className="w-full max-w-xs mx-auto flex items-center justify-between pb-8 select-none">
          <div className="flex flex-col items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-green-500 text-black font-black text-[9px] flex items-center justify-center">
              <CheckCircle2 className="h-3 w-3" />
            </div>
            <span className="text-[8px] font-black uppercase text-green-500 tracking-wider">Phone</span>
          </div>
          <div className="h-0.5 bg-primary flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-primary text-black font-black text-[9px] flex items-center justify-center">2</div>
            <span className="text-[8px] font-black uppercase text-primary tracking-wider">Verify</span>
          </div>
          <div className="h-0.5 bg-zinc-800 flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-zinc-900 text-zinc-500 font-bold text-[9px] flex items-center justify-center border border-zinc-800">3</div>
            <span className="text-[8px] font-black uppercase text-zinc-500 tracking-wider">Details</span>
          </div>
        </div>

        <OTPVerification
          phone={mobileNumber}
          onVerified={handleOTPVerified}
          onBack={() => setStep("phone")}
          onSendOTP={sendOTPAction}
          onVerifyOTP={verifyOTPAction}
          onResendOTP={resendOTPAction}
          autoSendOnMount={true}
        />
      </div>
    );
  }

  // Customer Details Step (for new customers)
  if (step === "details") {
    return (
      <div className="w-full max-w-xl mx-auto py-4 px-2 animate-in fade-in duration-300">
        <div className="w-full max-w-xs mx-auto flex items-center justify-between pb-8 select-none">
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-green-500 text-black font-black text-[11px] flex items-center justify-center"><CheckCircle2 className="h-3 w-3" /></div><span className="text-xs font-black uppercase text-green-500 tracking-wider">Phone</span></div>
          <div className="h-0.5 bg-primary flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">2</div><span className="text-xs font-black uppercase text-primary tracking-wider">Details</span></div>
          <div className="h-0.5 bg-zinc-800 flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-zinc-900 text-zinc-400 font-bold text-[11px] flex items-center justify-center border border-zinc-800">3</div><span className="text-xs font-black uppercase text-zinc-400 tracking-wider">Payment</span></div>
        </div>

        <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
          <div className="border-b border-zinc-900 pb-4 space-y-1">
            <h3 className="text-lg font-black uppercase text-white tracking-tight">NEW CUSTOMER REGISTRATION</h3>
            <p className="text-xs text-zinc-400 font-medium">Please provide your details to create your profile.</p>
          </div>

          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-900 text-xs">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-zinc-400">Phone Number:</span>
              <span className="text-white font-black">+91 {mobileNumber}</span>
            </div>
          </div>

          <form onSubmit={handleDetailsSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5"><User className="h-3 w-3 text-zinc-600" /> FULL NAME <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                type="text"
                required
                placeholder="Enter your full name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="bg-zinc-950 border-zinc-900 h-12 text-sm text-white focus-visible:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dob" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Cake className="h-3 w-3 text-zinc-600" /> DATE OF BIRTH (DD-MM-YYYY) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="dob"
                type="text"
                placeholder="DD-MM-YYYY"
                required
                maxLength={10}
                value={customerDob}
                onChange={handleDobChange}
                className="bg-zinc-950 border-zinc-900 h-12 text-sm text-white font-mono tracking-wider focus-visible:ring-primary rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5"><Mail className="h-3 w-3 text-zinc-600" /> EMAIL ADDRESS <span className="text-red-500">*</span></Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="Enter your email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="bg-zinc-950 border-zinc-900 h-12 text-sm text-white focus-visible:ring-primary"
              />
            </div>

            <div className="pt-4 space-y-2">
              <Button variant="gradient" type="submit" disabled={isSubmitting || !detailsComplete} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
                CONTINUE TO SUMMARY <ChevronRight className="h-4 w-4 stroke-[3]" />
              </Button>
              <Button type="button" onClick={() => setStep("phone")} variant="ghost" className="w-full border border-zinc-900 text-zinc-400 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl">
                ← CHANGE PHONE NUMBER
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  // Summary & Confirmation Step
  if (step === "summary") {
    return (
      <div className="w-full max-w-2xl mx-auto py-4 px-2 animate-in fade-in duration-300">
        <div className="w-full max-w-xs mx-auto flex items-center justify-between pb-8 select-none">
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-green-500 text-black font-black text-[11px] flex items-center justify-center"><CheckCircle2 className="h-3 w-3" /></div><span className="text-xs font-black uppercase text-green-500 tracking-wider">Phone</span></div>
          <div className="h-0.5 bg-green-500 flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-green-500 text-black font-black text-[11px] flex items-center justify-center"><CheckCircle2 className="h-3 w-3" /></div><span className="text-xs font-black uppercase text-green-500 tracking-wider">Details</span></div>
          <div className="h-0.5 bg-primary flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">3</div><span className="text-xs font-black uppercase text-primary tracking-wider">Payment</span></div>
        </div>

        <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
          <div className="border-b border-zinc-900 pb-4 space-y-1">
            <h3 className="text-lg font-black uppercase text-white tracking-tight">BOOKING SUMMARY</h3>
            <p className="text-xs text-zinc-400 font-medium">Review your booking details before confirmation.</p>
          </div>

          {/* Customer Information */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 glow-box-hover">
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Customer Information</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-400">Customer:</span> <span className="text-white font-bold">{customerName || existingCustomerData?.name}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Phone:</span> <span className="text-primary font-bold">+91 {mobileNumber}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Email:</span> <span className="text-white font-bold truncate ml-4">{customerEmail || existingCustomerData?.email}</span></div>
              {/* Date of birth is still collected on the form above and stored
                  against the customer, but it is only ever displayed in the
                  admin customers table - never back to the customer. */}
            </div>
          </div>

          {/* Booking Details */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 glow-box-hover">
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Booking Details</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-400">Device:</span> <span className="text-white font-bold text-right">{deviceTypeName}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Date:</span> <span className="text-white font-bold text-right">{selectedDate ? `${new Date(selectedDate).toLocaleDateString()}, ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short' })}` : "--"}
                {sessionEndDate && (
                  <span className="block text-[11px] text-amber-400 font-bold">
                    ends {sessionEndDate.toLocaleDateString()}, {sessionEndDate.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                )}
              </span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Time Slot:</span> <span className="text-primary font-bold">{selectedSlot}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Duration:</span> <span className="text-white font-bold">{selectedDurationLabel}</span></div>
            </div>
          </div>

          {/* Active Subscription (if any) */}
          {bookingState.activeSubscriptionId && (
            <div className="bg-gradient-to-r from-primary/10 via-amber-500/10 to-primary/10 p-4 rounded-xl border border-primary/30 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-primary uppercase tracking-wider">{bookingState.subscriptionPlanName} Active</h4>
                  <p className="text-xs text-zinc-400">You're getting {bookingState.subscriptionDiscountPercentage}% off on this booking!</p>
                </div>
              </div>
            </div>
          )}

          {/* Promo Code Section */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-zinc-500" />
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider">
                Have a Promo Code?
              </h4>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                className="bg-[#0a0a0a] border-zinc-800 text-white uppercase font-mono text-sm"
                disabled={isApplyingPromo || bookingState.promoCode !== null}
              />
              {bookingState.promoCode ? (
                <Button
                  onClick={handleRemovePromo}
                  variant="outline"
                  className="text-red-400 border-red-500/30 hover:bg-red-950/20 px-4"
                  disabled={isApplyingPromo}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  onClick={handleApplyPromo}
                  disabled={!promoCode.trim() || isApplyingPromo}
                  variant="gradient"
                  className="px-6"
                >
                  {isApplyingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                </Button>
              )}
            </div>
            {bookingState.promoCode && (
              <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-950/30 px-3 py-2 rounded-lg border border-green-500/20">
                <CheckCircle2 className="h-3 w-3" />
                <span className="font-bold">Code "{bookingState.promoCode}" applied successfully!</span>
              </div>
            )}
          </div>

          {/* Pricing Details */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 glow-box-strong">
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Price Breakdown</h4>
            <div className="space-y-2 text-sm">
              {(() => {
                const {
                  durationInHours,
                  deviceCharges,
                  extraPlayerCharges,
                  addonsTotal,
                  subtotal: calculatedSubtotal,
                  total: calculatedTotal,
                  subscriptionDiscount,
                  promoDiscount,
                  happyHourDiscount,
                  happyHourRuleName,
                  isServerPriced,
                } = effectivePricing;

                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Device Booking ({durationInHours}h × ₹{hourlyRate}):</span>
                      <span className="text-white">₹{deviceCharges.toFixed(2)}</span>
                    </div>

                    {playerCount > includedPlayers && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Extra Players ({playerCount - includedPlayers} × ₹{perExtraPlayerCharge(extraPlayerCharge, durationInHours)}):</span>
                        <span className="text-white">₹{extraPlayerCharges.toFixed(2)}</span>
                      </div>
                    )}

                    {addons.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Add-ons:</span>
                        <span className="text-white">₹{addonsTotal.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between border-t border-zinc-800 pt-2">
                      <span className="text-zinc-400 font-bold">Subtotal:</span>
                      <span className="text-white font-bold">₹{calculatedSubtotal.toFixed(2)}</span>
                    </div>

                    {subscriptionDiscount > 0 && (
                      <div className="flex justify-between text-green-500">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Subscription Discount ({bookingState.subscriptionDiscountPercentage}%):
                        </span>
                        <span className="font-bold">-₹{subscriptionDiscount.toFixed(2)}</span>
                      </div>
                    )}

                    {promoDiscount > 0 && (
                      <div className="flex justify-between text-primary">
                        <span className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          Promo Discount ({bookingState.promoCode}):
                        </span>
                        <span className="font-bold">-₹{promoDiscount.toFixed(2)}</span>
                      </div>
                    )}

                    {happyHourDiscount > 0 && (
                      <div className="flex justify-between text-yellow-400">
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Happy Hour Discount{happyHourRuleName ? ` (${happyHourRuleName})` : ''}:
                        </span>
                        <span className="font-bold">-₹{happyHourDiscount.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="border-t border-zinc-800 pt-2 flex justify-between font-black text-base">
                      <span className="text-white">Total Amount:</span>
                      <span className="text-primary text-lg">₹{calculatedTotal.toFixed(2)}</span>
                    </div>

                    {isServerPriced && (
                      <p className="text-xs text-zinc-400 pt-1">
                        Confirmed price — this is exactly what you will be charged.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <div className="space-y-2">
            <Button variant="gradient" onClick={handleConfirmBooking} disabled={isSubmitting} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-1.5">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : "PAY & CONFIRM"} <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button type="button" onClick={() => customerExists ? setStep("phone") : setStep("details")} variant="ghost" className="w-full border border-zinc-900 text-zinc-400 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl">
              ← BACK
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Success Step
  if (step === "success") {
    return (
      <div className="w-full max-w-2xl mx-auto py-4 px-2 animate-in fade-in duration-500">
        <Card className="bg-[#111] border border-green-500/20 p-8 shadow-2xl rounded-2xl space-y-6 glow-box-strong">
          {/* Success Header */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase text-white tracking-tight">BOOKING CONFIRMED!</h3>
              <p className="text-sm text-zinc-400">Your slot has been successfully reserved.</p>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-900 space-y-4 glow-box-strong">
            <div className="flex items-center justify-center gap-2 text-xs font-black text-zinc-400 uppercase tracking-wider">
              <QrCode className="h-4 w-4" />
              <span>Booking QR Code</span>
            </div>
            <div className="flex justify-center bg-white p-4 rounded-lg">
              <QRCodeSVG value={bookingNumber} size={160} level="H" />
            </div>
            <div className="text-center">
              <p className="text-xs text-zinc-400 mb-1">Booking Number</p>
              <p className="text-lg font-black text-primary font-mono tracking-wider">{bookingNumber}</p>
            </div>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 text-sm glow-box-hover">
            <h4 className="text-xs font-black text-zinc-400 uppercase">Booking Details</h4>
            <div className="flex justify-between"><span className="text-zinc-400">Customer:</span> <span className="text-white font-bold">{customerName || existingCustomerData?.name}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Phone:</span> <span className="text-primary font-bold">+91 {mobileNumber}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Device:</span> <span className="text-white font-bold">{deviceTypeName}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Date:</span> <span className="text-white font-bold">{selectedDate ? new Date(selectedDate).toLocaleDateString() : "--"}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Time:</span> <span className="text-primary font-bold">{selectedSlot}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Duration:</span> <span className="text-white font-bold">{selectedDurationLabel}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Players:</span> <span className="text-white font-bold">{playerCount}</span></div>
            {playerCount > includedPlayers && (
              <div className="flex justify-between text-xs"><span className="text-zinc-600">Extra Players:</span> <span className="text-zinc-400">+₹{extraPlayersCharge(playerCount - includedPlayers, extraPlayerCharge, (selectedDuration || 60) / 60).toFixed(2)}</span></div>
            )}
            {effectivePricing.subscriptionDiscount > 0 && (
              <div className="flex justify-between text-xs text-green-500"><span>Subscription Discount ({bookingState.subscriptionDiscountPercentage}%):</span> <span>-₹{effectivePricing.subscriptionDiscount.toFixed(2)}</span></div>
            )}
            {effectivePricing.promoDiscount > 0 && (
              <div className="flex justify-between text-xs text-primary"><span>Promo Discount ({bookingState.promoCode}):</span> <span>-₹{effectivePricing.promoDiscount.toFixed(2)}</span></div>
            )}
            {effectivePricing.happyHourDiscount > 0 && (
              <div className="flex justify-between text-xs text-yellow-400"><span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />Happy Hour Discount:</span> <span>-₹{effectivePricing.happyHourDiscount.toFixed(2)}</span></div>
            )}
            {/* Only ever reflects money the server confirmed as captured -
                amountPaid comes back from payment verification, not this screen. */}
            <div className="flex justify-between border-t border-zinc-800 pt-2 font-black">
              <span className="text-zinc-400">{amountPaid > 0 ? "Amount Paid:" : "Amount Due:"}</span>
              <span className="text-white">₹{amountPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-xs">Payment Status:</span>
              <span className="text-xs font-black uppercase px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/40">
                {amountPaid > 0 ? "Paid Online" : "No Payment Due"}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button variant="gradient" onClick={() => router.push(`/booking/${bookingId}/food`)} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-2">
              <UtensilsCrossed className="h-4 w-4" />
              ORDER FOOD & DRINKS
            </Button>
            <Button onClick={() => {
              dispatch(resetBooking());
              router.push(`/retrieve?phone=${mobileNumber}`);
            }} variant="ghost" className="w-full border-2 border-primary text-zinc-300 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl">
              VIEW MY BOOKINGS
            </Button>
            <Button onClick={() => {
              dispatch(resetBooking());
              router.push("/");
            }} variant="ghost" className="w-full text-zinc-300 border border-zinc-800 hover:text-zinc-400 font-bold uppercase text-xs h-10 rounded-xl">
              BACK TO HOME
            </Button>
          </div>

          {/* Footer Note */}
          <div className="pt-2 flex gap-2 items-center text-xs text-zinc-400 justify-center border-t border-zinc-950">
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-700" />
            <span>Show this QR code at the counter to start your session</span>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}

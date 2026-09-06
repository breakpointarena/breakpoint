"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  clearCart,
  removeFromCart,
  incrementQuantity,
  decrementQuantity
}
  from "@/lib/redux/slices/foodCartSlice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addFoodOrderToBooking,
  validateMenuItems
} from "../actions";
import {
  createFoodOrderPaymentOrder,
  confirmFoodOrderPayment
} from "../payment-actions";
import {
  openRazorpayCheckout,
  loadRazorpayCheckout,
  RazorpayDismissedError,
  RazorpayFailedError,
} from "@/lib/razorpay/checkout";
import { checkCustomerExists } from "../../booking/actions";
import { sendOTPAction, verifyOTPAction, resendOTPAction, checkActiveSessionAction } from "../../booking/otp-actions";
import OTPVerification from "@/components/auth/OTPVerification";
import {
  Loader2,
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  User,
  Phone,
  Mail,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Cake,
  CheckCircle2,
  ArrowLeft,
  QrCode,
  UtensilsCrossed,
  Sparkles
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { formatDateForDB, formatDateForDisplay, handleDobInput, isValidDob, DOB_ERROR } from "@/lib/utils/dates";
import { allFilled, isPlausibleEmail } from "@/lib/utils/forms";
import Link from "next/link";
import { formatCurrency } from "@/lib/currency";

/**
 * "otp" proves the customer owns the number before anything is priced.
 *
 * "summary" sits between identifying the customer and opening Razorpay. Without
 * it the phone lookup dropped a returning customer straight into the payment
 * sheet with no chance to check what they were about to be charged for.
 */
type Step = "cart" | "phone" | "otp" | "details" | "summary" | "success";

export default function FoodCheckoutPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const cartItems = useAppSelector((state) => state.foodCart.items);

  const bookingContext = useAppSelector((state) => ({
    bookingId: state.foodCart.bookingId,
    bookingNumber: state.foodCart.bookingNumber,
    customerPhone: state.foodCart.customerPhone,
    customerName: state.foodCart.customerName,
    customerDob: state.foodCart.customerDob,
  }));

  const [step, setStep] = useState<Step>("cart");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState(bookingContext.customerPhone || "");
  const [name, setName] = useState(bookingContext.customerName || "");
  const [email, setEmail] = useState("");
  const [customerDob, setCustomerDob] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  // Authoritative breakdown from the pricing server action; wins over anything
  // this screen computed once we have it.
  const [serverSummary, setServerSummary] = useState<{
    itemsTotal: number;
    totalAmount: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (bookingContext.customerPhone) setPhone(bookingContext.customerPhone);
    if (bookingContext.customerName) setName(bookingContext.customerName);
    if (bookingContext.customerDob) setCustomerDob(bookingContext.customerDob);
  }, [bookingContext.customerPhone, bookingContext.customerName]);



  // Warm up the Razorpay SDK once the customer starts checking out, so tapping
  // "Pay" opens the checkout immediately. Not needed for the pay-at-counter tab.
  useEffect(() => {
    if ((step === "phone" || step === "details") && !bookingContext.bookingId) {
      loadRazorpayCheckout().catch(() => {
        /* Surfaced on the pay attempt instead of interrupting checkout. */
      });
    }
  }, [step, bookingContext.bookingId]);

  // Gates the new-customer submit: every starred field must be filled.
  const detailsComplete =
    allFilled(name, customerDob) &&
    customerDob.length === 10 &&
    isPlausibleEmail(email);

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = handleDobInput(e.target.value);
    setCustomerDob(formatted);
  };

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cartItems]);

  // Food carries no discounts, so the total is simply the cart total.
  const finalTotalAmount = cartTotal;

  // What the customer is shown. Defers to the server's price the moment it has
  // told us what it will charge.
  const effectiveItemsTotal = serverSummary?.itemsTotal ?? cartTotal;
  const effectiveTotal = serverSummary?.totalAmount ?? finalTotalAmount;

  const cartItemCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  /**
   * Food ordered against an active device session goes on that session's tab and
   * is settled at the counter - no identification step and no online payment.
   */
  const isOnTab = Boolean(bookingContext.bookingId);
  const summaryName = bookingContext.customerName || name;
  const summaryPhone = bookingContext.customerPhone || phone;

  const handleProceedToCheckout = async () => {
    // On-tab orders already know who the customer is from the session, so they
    // skip identification - but they still get the review screen before the
    // items are committed to the tab.
    if (isOnTab) {
      setStep("summary");
      return;
    }

    // Already signed in? Go straight to the summary. Asking a logged-in
    // customer to retype the number they just verified is friction with no
    // security value - the session already proves it.
    setIsSubmitting(true);
    const session = await checkActiveSessionAction();

    if (session.isValid && session.phone) {
      setPhone(session.phone);
      await proceedAfterPhoneVerification(session.phone);
    } else {
      setStep("phone");
    }

    setIsSubmitting(false);
  };

  const handlePhoneLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim() || phone.length < 10) {
      toast.error("Invalid Entry", { description: "Please enter a valid 10-digit mobile number." });
      return;
    }

    setIsSubmitting(true);

    // Does THIS browser already hold a verified session (15 min window)?
    const sessionCheck = await checkActiveSessionAction();

    // Skip OTP only when the live session belongs to the number being entered.
    // A session for one number must never wave through an order for another.
    if (sessionCheck.isValid && sessionCheck.phone === phone) {
      toast.success("Session Active", { description: "Welcome back! Your session is still active." });
      await proceedAfterPhoneVerification(phone);
    } else {
      setStep("otp");
    }

    setIsSubmitting(false);
  };

  const proceedAfterPhoneVerification = async (phoneNumber: string) => {
    const result = await checkCustomerExists(phoneNumber);

    if (result.exists && result.customer) {
      setName(result.customer.name);
      setEmail(result.customer.email || "");
      // Handle DOB safely - convert from DB format if exists
      const dobFromDB = result.customer.date_of_birth;
      if (dobFromDB) {
        setCustomerDob(formatDateForDisplay(dobFromDB));
      }
      toast.success("Welcome back!", { description: `Hey ${result.customer.name}! Profile authenticated successfully.` });

      // Review before paying, rather than dropping straight into Razorpay.
      // No membership lookup here: food is never discounted, so a customer's
      // subscription has no bearing on what this order costs.
      setStep("summary");
    } else {
      toast.info("New Profile", { description: "Please complete registration to place your order." });
      setStep("details");
    }
  };

  const handleOTPVerified = async (phoneNumber: string) => {
    await proceedAfterPhoneVerification(phoneNumber);
  };

  const handleNewCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Required Field Missing", { description: "Name configuration is necessary." });
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

    // Straight to the review screen; payment happens from there.
    setStep("summary");
  };

  /** Called from the summary screen once the customer has seen what they owe. */
  const handleConfirmAndPay = async () => {
    if (isOnTab) {
      // Identity comes from the active session, not from a form the customer
      // filled in - they never saw one.
      const dobValue = bookingContext.customerDob || customerDob;
      await submitOrderPayload(
        bookingContext.customerPhone || phone,
        bookingContext.customerName || name,
        null,
        dobValue ? formatDateForDB(dobValue) : ""
      );
      return;
    }

    const formattedDob = customerDob ? formatDateForDB(customerDob) : "";
    await submitOrderPayload(phone, name, email.trim() || null, formattedDob);
  };

  const submitOrderPayload = async (
    targetPhone: string,
    targetName: string,
    targetEmail: string | null,
    dob: string
  ) => {
    setIsSubmitting(true);

    const validationResult = await validateMenuItems(
      cartItems.map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
      }))
    );

    if (!validationResult.success) {
      toast.error("Item no longer available", {
        description: validationResult.error,
        duration: 8000
      });
      setIsSubmitting(false);
      return;
    }

    // Food added to an active device session goes on the customer's tab and is
    // settled at the counter - no online payment for that path.
    if (bookingContext.bookingId) {
      const result = await addFoodOrderToBooking(
        bookingContext.bookingId,
        cartItems.map((item) => ({
          menu_item_id: item.menu_item_id,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          price: item.price,
        }))
      );

      if (result.success) {
        if (bookingContext.bookingNumber) {
          setOrderNumber(bookingContext.bookingNumber);
        }
        toast.success("Order Placed Successfully!", {
          description: "Added to your session tab - pay at the counter.",
        });
        setStep("success");
      } else {
        toast.error("Order Failed", { description: result.error });
      }

      setIsSubmitting(false);
      return;
    }

    try {
      // The server re-prices the cart from the menu; this screen never dictates
      // the amount charged.
      const order = await createFoodOrderPaymentOrder({
        phone: targetPhone,
        name: targetName,
        email: targetEmail,
        dateOfBirth: dob,
        items: cartItems.map((item) => ({
          id: item.menu_item_id,
          quantity: item.quantity,
        })),
      });

      if (!order.success) {
        // Session lapsed mid-checkout - send them back to verify.
        if (order.verificationRequired) {
          toast.error("Verification Needed", { description: order.error });
          setStep("otp");
          return;
        }
        toast.error("Order Failed", { description: order.error });
        return;
      }

      if (order.summary) {
        setServerSummary(order.summary);
      }

      if (order.freeOrder) {
        setOrderNumber(order.bookingNumber || "");
        setAmountPaid(0);
        toast.success("Order Placed Successfully!");
        setStep("success");
        return;
      }

      // The server prices the cart from the menu, so it can legitimately disagree
      // with this screen - a price change, an item pulled from sale. Never open
      // checkout on a number the customer has not seen.
      if (
        order.summary &&
        Math.abs(order.summary.totalAmount - cartTotal) > 0.01
      ) {
        toast.warning("Price Updated", {
          description: `Your order now comes to ₹${formatCurrency(
            order.summary.totalAmount
          )}. Please review and confirm.`,
        });
        return;
      }

      const response = await openRazorpayCheckout({
        keyId: order.keyId!,
        orderId: order.orderId!,
        amount: order.amount!,
        name: "Break Point Arena",
        description: `Food & Drinks (${cartItems.length} item${cartItems.length > 1 ? "s" : ""})`,
        prefill: {
          name: targetName,
          email: targetEmail || "",
          contact: targetPhone,
        },
      });

      const confirmed = await confirmFoodOrderPayment(response);

      if (confirmed.success) {
        setOrderNumber(confirmed.bookingNumber || "");
        setAmountPaid(confirmed.amountPaid ?? order.amount ?? 0);
        toast.success("Payment Successful!", { description: "Your order is being prepared." });
        setStep("success");
      } else {
        toast.error("Order Failed", { description: confirmed.error });
      }
    } catch (err) {
      if (err instanceof RazorpayDismissedError) {
        toast.info("Payment Cancelled", { description: "Your order has not been placed." });
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

  const handleNewOrder = () => {
    dispatch(clearCart());
    router.push("/food");
  };

  if (!mounted) return null;


  if (cartItems.length === 0 && step !== "success") {
    return (
      <div className="h-[60vh] flex items-center justify-center bg-[#0d0a14]">
        <Card className="bg-[#111] border-zinc-900 p-12 max-w-md mx-auto rounded-xl glow-box-hover">
          <div className="text-center space-y-4">
            <ShoppingCart className="h-16 w-16 text-zinc-700 mx-auto" />
            <h2 className="text-xl font-black text-zinc-400 uppercase">Cart is Empty</h2>
            <p className="text-sm text-zinc-400">Add items to your cart to place an order</p>
            <Button variant="gradient" onClick={() => router.push("/food")} className="text-black font-black uppercase px-6 py-4 rounded-xl">
              Browse Menu
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (step === "cart") {
    return (
      <div className="w-full max-w-5xl mx-auto py-6 px-4 space-y-6 animate-in fade-in duration-200">
        <div className="flex flex-col gap-1 select-none">
          <div className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 mt-9 relative z-0">
            <Link href="/" className="hover:text-primary transition-colors">
              Home
            </Link>
            <ChevronRight className="h-2.5 w-2.5 text-zinc-700" />

            <Link href="/food" className="hover:text-primary transition-colors">
              Respawn Refuel
            </Link>
            <ChevronRight className="h-2.5 w-2.5 text-zinc-700" />

            <span className="text-primary">Cart</span>
          </div>
          <h1 className="text-3xl font-black uppercase text-white tracking-tight mt-2">
            Your Cart <span className="text-zinc-400 font-medium text-lg lowercase font-sans">Items ({cartItemCount})</span>
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-3">
            {cartItems.map((item) => (
              <Card
                key={item.menu_item_id}
                className="bg-[#121214] border border-zinc-900 p-3 sm:p-4 rounded-2xl flex items-center gap-3 sm:gap-4 transition-all hover:border-zinc-800"
              >
                {/* Thumbnail: fallback sits underneath and shows through if the image is missing or fails to load */}
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-900/60 flex-shrink-0">
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                    <Sparkles className="h-5 w-5 opacity-40" />
                  </div>
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt=""
                      className="relative w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm sm:text-[15px] text-zinc-100 leading-snug line-clamp-2 break-words">
                    {item.name}
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">{item.category}</p>
                  {item.quantity > 1 && (
                    <p className="text-[11px] text-zinc-400 tabular-nums mt-0.5">₹{formatCurrency(item.price)} each</p>
                  )}
                </div>

                {/* Stacks on mobile so the stepper and price never compete for the same row */}
                <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4 flex-shrink-0">
                  <div className="flex items-center bg-zinc-950 border border-zinc-800 p-0.5 rounded-lg">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${item.name}`}
                      onClick={() => dispatch(decrementQuantity(item.menu_item_id))}
                      className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-sm font-black text-zinc-100 w-7 text-center tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${item.name}`}
                      onClick={() => dispatch(incrementQuantity(item.menu_item_id))}
                      className="h-7 w-7 flex items-center justify-center rounded text-black bg-primary hover:bg-primary-hover transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2">
                    <span className="text-sm sm:text-base font-black text-primary tabular-nums text-right min-w-[68px]">
                      ₹{formatCurrency(item.price * item.quantity)}
                    </span>

                    <button
                      type="button"
                      aria-label={`Remove ${item.name} from cart`}
                      onClick={() => dispatch(removeFromCart(item.menu_item_id))}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}

            <button type="button" onClick={() => router.push("/food")} className="flex items-center gap-2 text-xs font-black uppercase text-zinc-300 hover:text-primary pt-2 select-none tracking-wider transition-colors">
              ← Continue Shopping
            </button>
          </div>

          <div className="lg:col-span-5">
            <Card className="bg-[#121214] border border-zinc-900 p-6 space-y-5 rounded-2xl shadow-2xl glow-box-strong">
              <h3 className="text-sm font-black uppercase text-zinc-200 tracking-wider pb-2 border-b border-zinc-900/60">Order Summary</h3>
              <div className="space-y-3.5 text-xs text-zinc-400">
                <div className="flex justify-between"><span>Subtotal</span><span className="text-zinc-200 font-mono font-bold">₹{formatCurrency(effectiveItemsTotal)}</span></div>
                <div className="flex justify-between items-baseline font-black text-white pt-4 border-t border-t-zinc-900">
                  <span className="text-xs uppercase text-zinc-400 font-black">Total</span>
                  <span className="text-2xl text-primary font-mono tracking-tight">₹{formatCurrency(effectiveTotal)}</span>
                </div>
                {serverSummary && (
                  <p className="text-xs text-zinc-400">
                    Confirmed price — this is exactly what you will be charged.
                  </p>
                )}
              </div>

              {/* No promo code field: food is never discounted. */}

              <Button variant="gradient" onClick={handleProceedToCheckout} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl shadow-xl shadow-primary/5 tracking-wider active:scale-[0.99] transition-transform">
                {isOnTab ? "Review Order" : "Proceed to Checkout"}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <div className="w-full max-w-xl mx-auto py-8 px-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="w-full max-w-xs mx-auto flex items-center justify-between pb-8 select-none">
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-[11px] flex items-center justify-center">1</div><span className="text-xs font-black uppercase text-zinc-400 tracking-wider">Cart</span></div>
          <div className="h-0.5 bg-primary flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">2</div><span className="text-xs font-black uppercase text-primary tracking-wider">Details</span></div>
          <div className="h-0.5 bg-zinc-800 flex-1 mx-2" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-zinc-900 text-zinc-400 font-bold text-[11px] flex items-center justify-center border border-zinc-800">3</div><span className="text-xs font-black uppercase text-zinc-400 tracking-wider">Confirm</span></div>
        </div>

        <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
          <div className="border-b border-zinc-900 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep("cart")}
                className="h-8 flex items-center gap-2 text-zinc-400 hover:text-white px-2"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="text-xs font-black uppercase tracking-wider">Back to Cart</span>
              </Button>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black uppercase text-white tracking-tight">CUSTOMER IDENTIFICATION</h3>
              <p className="text-xs text-zinc-400 font-medium">Enter your mobile number to load profiles or route standalone orders.</p>
            </div>
          </div>

          <form onSubmit={handlePhoneLookupSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5"><Phone className="h-3 w-3 text-zinc-600" /> MOBILE NUMBER <span className="text-red-500">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-400 border-r border-zinc-900 pr-2">+91</span>
                <Input
                  id="phone"
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="Enter 10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  className="bg-zinc-950 border-zinc-900 h-12 pl-12 text-sm text-white focus-visible:ring-primary font-mono tracking-wide rounded-xl"
                />
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <Button variant="gradient" type="submit" disabled={isSubmitting || phone.trim().length < 10} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-1.5 shadow-xl transition-all disabled:opacity-50 disabled:pointer-events-none">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : "CONTINUE"} <ChevronRight className="h-4 w-4 stroke-[3]" />
              </Button>
            </div>
          </form>

          <div className="pt-2 flex gap-2 items-center text-xs text-zinc-400 justify-center select-none border-t border-zinc-950">
            <ShieldCheck className="h-4 w-4 text-zinc-700" /><span>OTP verification required for secure ordering.</span>
          </div>
        </Card>
      </div>
    );
  }

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
          phone={phone}
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

  if (step === "details") {
    return (
      <div className="w-full max-w-xl mx-auto py-4 px-2 animate-in fade-in duration-300">
        <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
          <div className="border-b border-zinc-900 pb-4 space-y-1">
            <h3 className="text-lg font-black uppercase text-white tracking-tight">NEW CUSTOMER REGISTRATION</h3>
            <p className="text-xs text-zinc-400 font-medium">Please provide your credentials to map this checkout profile transaction.</p>
          </div>

          <div className="bg-zinc-950 p-4 border border-zinc-900 rounded-xl flex items-center justify-between gap-4 text-xs">
            <div className="space-y-0.5">
              <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest block">Entered Identity</span>
              <span className="text-primary font-mono font-black tracking-wider">+91 {phone}</span>
            </div>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="px-3 h-8 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-black uppercase text-zinc-400 hover:text-primary rounded-lg tracking-wider flex items-center gap-1.5 transition-colors select-none"
            >
              <RefreshCw className="h-3 w-3" /> Change Number
            </button>
          </div>

          <form onSubmit={handleNewCustomerSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5"><User className="h-3 w-3 text-zinc-600" /> FULL NAME <span className="text-red-500">*</span></Label>
              <Input id="name" type="text" required placeholder="Enter full name" value={name} onChange={(e) => setName(e.target.value)} className="bg-zinc-950 border-zinc-900 h-12 text-sm text-white focus-visible:ring-primary rounded-xl" />
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
                className="bg-zinc-950 border-zinc-900 h-12 text-sm text-white focus-visible:ring-primary rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5"><Mail className="h-3 w-3 text-zinc-600" /> EMAIL ADDRESS <span className="text-red-500">*</span></Label>
              <Input id="email" type="email" required placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-zinc-950 border-zinc-900 h-12 text-sm text-white focus-visible:ring-primary rounded-xl" />
            </div>

            <div className="pt-4 space-y-2">
              <Button variant="gradient" type="submit" disabled={isSubmitting || !detailsComplete} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : "REVIEW ORDER"} <ChevronRight className="h-4 w-4 stroke-[3]" />
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  if (step === "summary") {
    return (
      <div className="w-full max-w-2xl mx-auto py-4 px-2 animate-in fade-in duration-300">
        <div className="w-full max-w-xs mx-auto flex items-center justify-between pb-8 select-none">
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-green-500 text-black font-black text-[11px] flex items-center justify-center"><CheckCircle2 className="h-3 w-3" /></div><span className="text-xs font-black uppercase text-green-500 tracking-wider">Cart</span></div>
          <div className="h-0.5 bg-green-500 flex-1 mx-2" />
          {/* On-tab orders never pass through identification, so that step is
              not shown as something they completed. */}
          {!isOnTab && (
            <>
              <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-green-500 text-black font-black text-[11px] flex items-center justify-center"><CheckCircle2 className="h-3 w-3" /></div><span className="text-xs font-black uppercase text-green-500 tracking-wider">Details</span></div>
              <div className="h-0.5 bg-primary flex-1 mx-2" />
            </>
          )}
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">{isOnTab ? 2 : 3}</div><span className="text-xs font-black uppercase text-primary tracking-wider">Confirm</span></div>
        </div>

        <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
          <div className="border-b border-zinc-900 pb-4 space-y-1">
            <h3 className="text-lg font-black uppercase text-white tracking-tight">ORDER SUMMARY</h3>
            <p className="text-xs text-zinc-400 font-medium">
              {isOnTab
                ? "Please review your order before adding it to your session tab."
                : "Please review your order before paying."}
            </p>
          </div>

          {isOnTab && bookingContext.bookingNumber && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-300 font-bold">
                Adding to session {bookingContext.bookingNumber} — pay at the counter.
              </p>
            </div>
          )}

          {/* Items */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 glow-box-hover">
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              Items ({cartItemCount})
            </h4>
            <div className="space-y-2">
              {cartItems.map((item) => (
                <div key={item.menu_item_id} className="flex items-center justify-between py-2 border-b border-zinc-900 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-zinc-300 truncate">{item.name}</span>
                    <span className="text-xs text-zinc-400 flex-shrink-0">x{item.quantity}</span>
                  </div>
                  <span className="text-sm text-white font-bold font-mono flex-shrink-0">₹{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Customer */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-2 text-sm glow-box-hover">
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Customer Information</h4>
            {summaryName && (
              <div className="flex justify-between"><span className="text-zinc-400">Name:</span> <span className="text-white font-bold">{summaryName}</span></div>
            )}
            {summaryPhone && (
              <div className="flex justify-between"><span className="text-zinc-400">Phone:</span> <span className="text-primary font-bold">+91 {summaryPhone}</span></div>
            )}
            {!isOnTab && email && (
              <div className="flex justify-between"><span className="text-zinc-400">Email:</span> <span className="text-white font-bold truncate ml-4">{email}</span></div>
            )}
          </div>

          {/* Total */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 glow-box-hover">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>Subtotal</span>
              <span className="text-zinc-200 font-mono font-bold">₹{formatCurrency(effectiveItemsTotal)}</span>
            </div>
            <div className="flex justify-between items-baseline font-black text-white pt-3 border-t border-zinc-900">
              <span className="text-xs uppercase text-zinc-400 font-black">
                {isOnTab ? "Added To Tab" : "Amount To Pay"}
              </span>
              <span className="text-2xl text-primary font-mono tracking-tight">₹{formatCurrency(effectiveTotal)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              variant="gradient"
              onClick={handleConfirmAndPay}
              disabled={isSubmitting}
              className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSubmitting
                ? <Loader2 className="h-4 w-4 animate-spin text-black" />
                : isOnTab
                  ? `ADD ₹${formatCurrency(effectiveTotal)} TO TAB`
                  : `PAY ₹${formatCurrency(effectiveTotal)}`} <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              onClick={() => setStep("cart")}
              variant="ghost"
              className="w-full border border-zinc-900 text-zinc-400 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl"
            >
              ← BACK TO CART
            </Button>
          </div>
        </Card>
      </div>
    );
  }

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
              <h3 className="text-2xl font-black uppercase text-white tracking-tight">ORDER CONFIRMED!</h3>
              <p className="text-sm text-zinc-400">Your food is being prepared.</p>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-900 space-y-4 glow-box-strong">
            <div className="flex items-center justify-center gap-2 text-xs font-black text-zinc-400 uppercase tracking-wider">
              <QrCode className="h-4 w-4" />
              <span>Order QR Code</span>
            </div>
            <div className="flex justify-center bg-white p-4 rounded-lg">
              <QRCodeSVG value={orderNumber || "FO-12345"} size={160} level="H" />
            </div>
            <div className="text-center">
              <p className="text-xs text-zinc-400 mb-1">Order Number</p>
              <p className="text-lg font-black text-primary font-mono tracking-wider">{orderNumber || "FO-12345"}</p>
            </div>
          </div>

          {/* Food Items Ordered */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 glow-box-hover">
            <h4 className="text-xs font-black text-zinc-400 uppercase flex items-center gap-2">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              Food Items Ordered
            </h4>
            <div className="space-y-2">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-zinc-900 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">{item.name}</span>
                    <span className="text-xs text-zinc-400">x{item.quantity}</span>
                  </div>
                  <span className="text-sm text-white font-bold">₹{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Order Details */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 text-sm glow-box-hover">
            <h4 className="text-xs font-black text-zinc-400 uppercase">Order Details</h4>
            <div className="flex justify-between"><span className="text-zinc-400">Customer:</span> <span className="text-white font-bold">{name}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Phone:</span> <span className="text-primary font-bold">+91 {phone}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Items Count:</span> <span className="text-white font-bold">{cartItemCount} items</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Subtotal:</span> <span className="text-white font-bold">₹{formatCurrency(effectiveItemsTotal)}</span></div>
            {/* On-tab orders are settled at the counter, so they are explicitly
                NOT presented as paid. Only amountPaid - which comes back from
                server-side payment verification - counts as money received. */}
            <div className="flex justify-between border-t border-zinc-800 pt-2 font-black">
              <span className="text-zinc-400">
                {bookingContext.bookingId ? "Added To Tab:" : "Amount Paid:"}
              </span>
              <span className="text-white">
                ₹{formatCurrency(bookingContext.bookingId ? effectiveTotal : amountPaid)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-xs">Payment Status:</span>
              {bookingContext.bookingId ? (
                <span className="text-xs font-black uppercase px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40">
                  Pay At Counter
                </span>
              ) : (
                <span className="text-xs font-black uppercase px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/40">
                  {amountPaid > 0 ? "Paid Online" : "No Payment Due"}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button variant="gradient" onClick={handleNewOrder} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              ORDER MORE FOOD
            </Button>
            <Button onClick={() => router.push("/retrieve")} variant="ghost" className="w-full border-2 border-primary text-zinc-300 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl">
              VIEW MY ORDERS
            </Button>
            <Button onClick={() => router.push("/")} variant="ghost" className="w-full text-zinc-300 border border-zinc-800 hover:text-zinc-400 font-bold uppercase text-xs h-10 rounded-xl">
              BACK TO HOME
            </Button>
          </div>

          {/* Footer Note */}
          <div className="pt-2 flex gap-2 items-center text-xs text-zinc-400 justify-center border-t border-zinc-950">
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-700" />
            <span>Show this QR code at the counter to claim your order</span>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
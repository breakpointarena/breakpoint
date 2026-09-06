"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Loader2,
  Phone,
  User,
  Mail,
  ShieldCheck,
  Cake,
  UtensilsCrossed,
  Plus,
  Minus,
  Trash2,
  Coffee,
  Pizza,
  Sandwich,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import { createFoodOnlyWalkInBooking, lookupWalkInCustomer } from "../actions";
import { formatDateForDB, handleDobInput, isValidDob, DOB_ERROR } from "@/lib/utils/dates";
import { allFilled, isPlausibleEmail } from "@/lib/utils/forms";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { useNotifications } from "@/lib/contexts/NotificationContext";
import { bookingNotificationId } from "@/lib/hooks/useAdminNotificationPolling";

export default function WalkInFoodOnlyPage() {
  const router = useRouter();
  const { addNotification } = useNotifications();
  const [step, setStep] = useState(1); // 1: Customer Lookup, 2: Food Selection, 3: Confirm

  // Customer details
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerDob, setCustomerDob] = useState("");
  /** Set once Continue has been pressed, so empty required fields can speak up too. */
  const [showDetailErrors, setShowDetailErrors] = useState(false);
  const [showFullRegistrationFields, setShowFullRegistrationFields] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [activeSubscription, setActiveSubscription] = useState<any>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Food items
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [selectedItems, setSelectedItems] = useState<{ id: string; name: string; price: number; quantity: number; category: string }[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadMenuItems();
  }, []);

  const loadMenuItems = async () => {
    setLoadingMenu(true);
    try {
      // Import the server action
      const { getMenuItems } = await import("@/app/(customer)/booking/[bookingId]/food/actions");
      const result = await getMenuItems();

      if (result.success && result.items) {
        setMenuItems(result.items);
      } else {
        toast.error("Failed to load menu items");
      }
    } catch (error) {
      console.error("Error loading menu:", error);
      toast.error("Failed to load menu items");
    }
    setLoadingMenu(false);
  };

  /**
   * The problem with the date, if there is one.
   *
   * Says nothing while the date is still being typed - only once it is complete,
   * or once Continue has been pressed - so the field does not go red at the first
   * digit. `DOB_ERROR` is the one place the wording lives.
   */
  const describeDobProblem = (value: string): string | null => {
    if (!value.trim()) return "Date of birth is required.";
    if (value.length < 10 && !showDetailErrors) return null;
    return isValidDob(value) ? null : DOB_ERROR;
  };

  // Shown as soon as the field has something in it, or once Continue is pressed.
  const dobError =
    customerDob.trim() || showDetailErrors ? describeDobProblem(customerDob) : null;

  const emailError =
    (customerEmail.trim().length > 0 || showDetailErrors) && !isPlausibleEmail(customerEmail)
      ? customerEmail.trim()
        ? "Enter a complete email address, like customer@domain.com."
        : "Email is required."
      : null;

  const nameError =
    showDetailErrors && !customerName.trim() ? "Customer name is required." : null;

  /**
   * Whether every required field has something in it.
   *
   * This is what greys the button out: with a field still blank there is nothing
   * to correct and no message to show, so a disabled button is honest. Presence
   * only - a filled-in but impossible date leaves the button live, because that
   * is a mistake the form has to be able to tell staff about, and a dead button
   * cannot.
   */
  const requiredDetailsFilled = Boolean(
    customerName.trim() && customerDob.trim() && customerEmail.trim()
  );

  // Whether the step may actually advance: filled *and* valid.
  const registrationComplete =
    allFilled(customerName, customerDob) &&
    isValidDob(customerDob) &&
    isPlausibleEmail(customerEmail);

  const handlePhoneLookup = async () => {
    if (customerPhone.length < 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    setCheckingProfile(true);
    const result = await lookupWalkInCustomer(customerPhone);

    if (result.exists && result.customer) {
      // Customer exists
      setCustomerName(result.customer.name);
      setCustomerEmail(result.customer.email || "");
      if (result.customer.date_of_birth) {
        // Convert from YYYY-MM-DD to DD-MM-YYYY for display
        const [year, month, day] = result.customer.date_of_birth.split("-");
        setCustomerDob(`${day}-${month}-${year}`);
      }
      setCustomerId(result.customer.id);
      setActiveSubscription(result.subscription || null);
      setShowFullRegistrationFields(false);
      toast.success(`Welcome back, ${result.customer.name}!`);
      setStep(2); // Move to food selection
    } else {
      // New customer
      setShowFullRegistrationFields(true);
      setCustomerId(null);
      setActiveSubscription(null);
      toast.info("New customer - please fill in details");
    }

    setCheckingProfile(false);
  };

  const handleRegisterAndProceed = () => {
    /**
     * A dead button explains nothing.
     *
     * The three toasts this replaces fired one at a time and named no field, and
     * the email test was `includes("@")`, which passes "a@b". The messages now sit
     * under the offending inputs, all at once; this only holds the step.
     */
    if (!registrationComplete) {
      setShowDetailErrors(true);
      return;
    }

    setShowDetailErrors(false);
    setStep(2);
    toast.success("Customer details saved. Select food items.");
  };

  const addFoodItem = (item: any) => {
    const existing = selectedItems.find(i => i.id === item.id);
    const currentQuantity = existing?.quantity || 0;

    // Check if we can add more based on available stock
    if (currentQuantity >= item.quantity) {
      toast.error(`Only ${item.quantity} ${item.name} available in stock`);
      return;
    }

    // Check if item is in stock
    if (item.quantity <= 0) {
      toast.error(`${item.name} is out of stock`);
      return;
    }

    if (existing) {
      setSelectedItems(selectedItems.map(i =>
        i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setSelectedItems([...selectedItems, {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        category: item.category
      }]);
    }
  };

  const updateQuantity = (itemId: string, change: number) => {
    const menuItem = menuItems.find(m => m.id === itemId);
    const currentItem = selectedItems.find(i => i.id === itemId);

    if (change > 0 && menuItem && currentItem) {
      // Check stock limit when increasing
      if (currentItem.quantity >= menuItem.quantity) {
        toast.error(`Only ${menuItem.quantity} ${menuItem.name} available in stock`);
        return;
      }
    }

    setSelectedItems(selectedItems.map(i => {
      if (i.id === itemId) {
        const newQuantity = Math.max(0, i.quantity + change);
        return { ...i, quantity: newQuantity };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const removeItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter(i => i.id !== itemId));
  };

  const totalAmount = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      toast.error("Please select at least one food item");
      return;
    }

    setSubmitting(true);

    try {
      const dobForDB = customerDob ? formatDateForDB(customerDob) : null;

      const result = await createFoodOnlyWalkInBooking({
        customerPhone,
        customerName,
        customerEmail,
        customerDob: dobForDB,
        customerId,
        foodItems: selectedItems.map(item => ({
          menuItemId: item.id,
          quantity: item.quantity,
          notes: ""
        })),
        totalAmount
      });

      if (result.success) {
        // One notification for the confirmed order: it toasts, chimes and lands
        // in the bell straight away. The poller reads walk-ins too now, so the id
        // is shared with it - its sweep of this booking finds this entry already
        // there instead of announcing the order a second time.
        addNotification({
          id: bookingNotificationId(result.bookingId || ""),
          type: "food",
          title: "Walk-In Food Order Confirmed",
          message: `${customerName.trim()} • #${result.bookingNumber} • ₹${Math.round(totalAmount).toLocaleString("en-IN")}`,
          bookingId: result.bookingId || "",
          bookingNumber: result.bookingNumber || ""
        });
        router.push("/admin/bookings");
      } else {
        toast.error("Failed to create order", { description: result.error });
      }
    } catch (error: any) {
      toast.error("Error creating order", { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Category icon mapping
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Snacks":
        return <Pizza className="h-4 w-4" />;
      case "Drinks":
        return <Coffee className="h-4 w-4" />;
      case "Meals":
        return <Sandwich className="h-4 w-4" />;
      default:
        return <UtensilsCrossed className="h-4 w-4" />;
    }
  };

  // Filter menu items
  const categories = ["All", "Snacks", "Drinks", "Meals"];
  const filteredMenuItems = activeCategory === "All"
    ? menuItems.filter(item => item.quantity > 0) // Only show items with stock
    : menuItems.filter(item => item.category === activeCategory && item.quantity > 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-black text-white">Food-Only Walk-In</h1>
            <p className="text-sm text-zinc-400">Create a food order without device booking</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className={`flex items-center gap-2 ${step >= 1 ? "text-primary" : "text-zinc-600"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 1 ? "bg-primary text-black" : "bg-zinc-800"}`}>1</div>
            <span className="text-sm font-bold">Customer</span>
          </div>
          <div className="h-0.5 w-12 bg-zinc-800"></div>
          <div className={`flex items-center gap-2 ${step >= 2 ? "text-primary" : "text-zinc-600"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 2 ? "bg-primary text-black" : "bg-zinc-800"}`}>2</div>
            <span className="text-sm font-bold">Food Items</span>
          </div>
          <div className="h-0.5 w-12 bg-zinc-800"></div>
          <div className={`flex items-center gap-2 ${step >= 3 ? "text-primary" : "text-zinc-600"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 3 ? "bg-primary text-black" : "bg-zinc-800"}`}>3</div>
            <span className="text-sm font-bold">Confirm</span>
          </div>
        </div>

        {/* Step 1: Customer Lookup */}
        {step === 1 && (
          <Card className="bg-[#111] border-zinc-900 p-6">
            <h2 className="text-lg font-bold text-white mb-4">Customer Information</h2>

            <div className="space-y-4">
              <div>
                <Label className="text-zinc-400">Phone Number <span className="text-red-500">*</span></Label>
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit mobile number"
                    className="bg-zinc-950 border-zinc-800 text-white"
                    maxLength={10}
                  />
                  <Button
                    onClick={handlePhoneLookup}
                    disabled={checkingProfile || customerPhone.length < 10}
                    variant="default"
                    className="bg-primary text-black hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {checkingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Lookup
                  </Button>
                </div>
              </div>

              {showFullRegistrationFields && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400">Full Name <span className="text-red-500">*</span></Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      aria-invalid={!!nameError}
                      aria-describedby={nameError ? "food-name-error" : undefined}
                      className={`bg-zinc-950 text-white ${nameError ? "border-red-500/70" : "border-zinc-800"}`}
                    />
                    {nameError && (
                      <p id="food-name-error" className="text-xs font-bold text-red-400">{nameError}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-zinc-400">Email <span className="text-red-500">*</span></Label>
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="email@example.com"
                      aria-invalid={!!emailError}
                      aria-describedby={emailError ? "food-email-error" : undefined}
                      className={`bg-zinc-950 text-white ${emailError ? "border-red-500/70" : "border-zinc-800"}`}
                    />
                    {emailError && (
                      <p id="food-email-error" className="text-xs font-bold text-red-400">{emailError}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-zinc-400">Date of Birth (DD-MM-YYYY) <span className="text-red-500">*</span></Label>
                    <Input
                      value={customerDob}
                      onChange={(e) => setCustomerDob(handleDobInput(e.target.value))}
                      placeholder="DD-MM-YYYY"
                      maxLength={10}
                      aria-invalid={!!dobError}
                      aria-describedby={dobError ? "food-dob-error" : undefined}
                      className={`bg-zinc-950 text-white ${dobError ? "border-red-500/70" : "border-zinc-800"}`}
                    />
                    {dobError && (
                      <p id="food-dob-error" className="text-xs font-bold text-red-400">{dobError}</p>
                    )}
                  </div>

                  {/* Disabled only while something is still blank. Once every
                      field has content the button goes live, so pressing it can
                      report what is actually wrong with it. */}
                  <Button
                    onClick={handleRegisterAndProceed}
                    disabled={!requiredDetailsFilled}
                    variant="gradient"
                    className="w-full disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Continue to Food Selection
                  </Button>
                </>
              )}
            </div>
          </Card>
        )}

        {/* Step 2: Food Selection */}
        {step === 2 && (
          <div className="space-y-6 pb-32">
            {/* Menu Items */}
            <Card className="bg-[#111] border-zinc-900 p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5" />
                Menu
              </h3>

              {/* Category Filter with Icons */}
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-4 mb-4 border-b border-zinc-800">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`px-4 py-2.5 text-xs font-black uppercase border rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
                      activeCategory === category
                        ? "bg-gradient-primary text-[var(--button-text)] border-primary"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {category !== "All" && getCategoryIcon(category)}
                    {category}
                  </button>
                ))}
              </div>

              {loadingMenu ? (
                <div className="py-12 flex justify-center">
                  <BreakpointLoader size="lg" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMenuItems.map((item: any) => {
                    const inCart = selectedItems.find(i => i.id === item.id);
                    const isAvailable = item.status === 'available' && item.quantity > 0;

                    return (
                      <div
                        key={item.id}
                        className={`bg-zinc-950 border rounded-lg p-4 transition-colors ${
                          isAvailable ? 'border-zinc-800 hover:border-primary/50' : 'border-zinc-900/50 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h5 className="text-white font-bold">{item.name}</h5>
                            {item.description && (
                              <p className="text-xs text-zinc-400 mt-1">{item.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <p className="text-primary font-bold">₹{item.price}</p>
                              <span className="text-xs text-zinc-400">• Stock: {item.quantity}</span>
                            </div>
                          </div>
                          {isAvailable ? (
                            inCart ? (
                              <div className="flex items-center gap-1 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-1 rounded-lg">
                                <button
                                  onClick={() => updateQuantity(item.id, -1)}
                                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-all"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="text-sm font-black text-primary w-6 text-center">{inCart.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.id, 1)}
                                  className="p-1.5 bg-gradient-primary text-[var(--button-text)] rounded transition-all hover:scale-110"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <Button
                                onClick={() => addFoodItem(item)}
                                size="sm"
                                className="bg-gradient-primary text-[var(--button-text)] font-black uppercase text-xs h-8 px-3"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )
                          ) : (
                            <span className="text-xs font-bold text-zinc-400 uppercase">Out of Stock</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {filteredMenuItems.length === 0 && !loadingMenu && (
                <div className="py-12 text-center">
                  <Coffee className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-400">No items available in this category.</p>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Fixed Bottom Cart Bar */}
        {step === 2 && selectedItems.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-[#0d0a14] border-t border-zinc-900 shadow-2xl z-50 backdrop-blur-lg bg-opacity-95">
            <div className="max-w-4xl mx-auto p-4">
              {/* Expanded Cart Items */}
              {isCartOpen && (
                <div className="mb-4 max-h-60 overflow-y-auto border-b border-zinc-900 pb-4 space-y-2 animate-in slide-in-from-bottom-2 duration-200">
                  {selectedItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-zinc-950 rounded-lg border border-zinc-800">
                      <div className="flex-1">
                        <p className="text-white font-bold text-sm">{item.name}</p>
                        <p className="text-xs text-zinc-400">₹{item.price} × {item.quantity}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateQuantity(item.id, -1)}
                          className="h-7 w-7 p-0"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-white font-bold w-6 text-center text-sm">{item.quantity}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateQuantity(item.id, 1)}
                          className="h-7 w-7 p-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeItem(item.id)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="ml-3 text-primary font-bold text-sm">
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cart Summary Bar */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsCartOpen(!isCartOpen)}
                  className="flex items-center gap-2 text-white hover:text-primary transition-colors"
                >
                  {isCartOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                  <div className="text-left">
                    <p className="text-xs text-zinc-400 font-bold uppercase">
                      {selectedItems.reduce((sum, item) => sum + item.quantity, 0)} Items
                    </p>
                    <p className="text-lg font-black text-primary">₹{totalAmount.toFixed(2)}</p>
                  </div>
                </button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || selectedItems.length === 0}
                  variant="gradient"
                  className="flex-1 font-black uppercase text-xs h-12 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    "Create Order & Collect Payment"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

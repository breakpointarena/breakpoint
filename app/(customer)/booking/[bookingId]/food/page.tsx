"use client";

import { useState, useEffect, useMemo } from "react";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Minus, ShoppingCart, UtensilsCrossed, Coffee, Pizza, ShoppingBag , Loader2 } from 'lucide-react';
import { toast } from "sonner";
import { getMenuItems, addFoodToBooking } from "./actions";

export default function FoodOrderPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const bookingId = params.bookingId as string;
  const returnUrl = searchParams.get("returnUrl");

  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [cart, setCart] = useState<{ [key: string]: { item: any; quantity: number } }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [isCartListOpen, setIsCartListOpen] = useState(false);

  useEffect(() => {
    loadMenu();
  }, []);

  const loadMenu = async () => {
    const result = await getMenuItems();
    if (result.success) {
      setMenuItems(result.items || []);
    } else {
      toast.error("Error", { description: "Failed to load menu items." });
    }
    setIsLoading(false);
  };

  const categories = ["All", "Snacks", "Drinks", "Meals"];

  const filteredItems = useMemo(() => {
    const filtered = activeCategory === "All"
      ? menuItems
      : menuItems.filter(item => item.category === activeCategory);

    // Only show items with stock available
    return filtered.filter(item => item.quantity > 0);
  }, [menuItems, activeCategory]);

  /**
   * One photo used to hollow out its neighbours.
   *
   * The grid makes every card in a row as tall as the tallest, so a single item
   * with an image left the imageless cards beside it as tall empty boxes with
   * the price stranded at the top. Cards are only given an image strip when
   * something in the list actually has a photo, and then they all get one —
   * the ones without fall back to their category icon, so a row reads as a set
   * of cards rather than one card and two empty frames. A menu with no photos
   * at all stays exactly as compact as it was.
   */
  const showImageStrip = useMemo(
    () => filteredItems.some(item => item.image_url),
    [filteredItems]
  );

  const categoryIcon = (category: string) =>
    category === 'Drinks' ? Coffee : category === 'Meals' ? Pizza : UtensilsCrossed;

  const addToCart = (item: any) => {
    const currentQuantity = cart[item.id]?.quantity || 0;

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

    setCart(prev => ({
      ...prev,
      [item.id]: {
        item,
        quantity: (prev[item.id]?.quantity || 0) + 1
      }
    }));
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const updated = { ...prev };
      if (updated[itemId].quantity > 1) {
        updated[itemId].quantity--;
      } else {
        delete updated[itemId];
      }
      return updated;
    });
  };

  const cartTotal = useMemo(() => {
    return Object.values(cart).reduce((sum, { item, quantity }) => sum + (item.price * quantity), 0);
  }, [cart]);

  const cartItemsCount = useMemo(() => {
    return Object.values(cart).reduce((sum, { quantity }) => sum + quantity, 0);
  }, [cart]);

  // Dynamically set main element z-index to ensure the fixed cart bar stays above the footer
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mainEl = document.querySelector('main');
    if (cartItemsCount > 0) {
      if (mainEl) mainEl.style.zIndex = '50';
    } else {
      if (mainEl) mainEl.style.zIndex = '';
    }
    return () => {
      if (mainEl) mainEl.style.zIndex = '';
    };
  }, [cartItemsCount]);

  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [confirmedItems, setConfirmedItems] = useState<any[]>([]);
  const [showSummary, setShowSummary] = useState(false);

  /**
   * Place Order opens the review step rather than submitting. The order is added
   * straight to the booking tab and cannot be edited afterwards, so the summary is
   * the only chance to catch a wrong item or quantity.
   */
  const handleReviewOrder = () => {
    if (cartItemsCount === 0) {
      toast.error("Cart Empty", { description: "Please add items to your cart." });
      return;
    }
    setShowSummary(true);
  };

  const handleSubmitOrder = async () => {
    if (cartItemsCount === 0) {
      toast.error("Cart Empty", { description: "Please add items to your cart." });
      return;
    }

    setIsSubmitting(true);

    const foodItems = Object.values(cart).map(({ item, quantity }) => ({
      menu_item_id: item.id,
      item_name: item.name,
      item_category: item.category,
      quantity,
      unit_price: item.price,
      line_total: item.price * quantity
    }));

    const result = await addFoodToBooking(bookingId, foodItems);

    if (result.success) {
      setConfirmedItems(foodItems);
      setShowSummary(false);
      setOrderConfirmed(true);
      toast.success("Order Placed!", { description: "Your food order has been added to the booking." });
    } else {
      toast.error("Order Failed", { description: result.error || "Something went wrong." });
    }

    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0a14] flex items-center justify-center">
        <BreakpointLoader size="lg" />
      </div>
    );
  }

  // Order Review View — last chance to check the order before it hits the booking
  if (showSummary && !orderConfirmed) {
    const summaryItems = Object.values(cart);

    return (
      <div className="w-full max-w-2xl mx-auto py-4 px-2 animate-in fade-in duration-300">
        <Card className="bg-[#111] border border-zinc-900 p-6 sm:p-8 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
          <div className="text-center space-y-2 border-b border-zinc-900 pb-5">
            <div className="flex justify-center mb-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                <ShoppingBag className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h3 className="text-2xl font-black uppercase text-white tracking-tight">Review Your Order</h3>
            <p className="text-sm text-zinc-400">
              Check the items below before confirming — this order is added to your booking and cannot be changed afterwards.
            </p>
          </div>

          {/* Itemised breakdown */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3">
            <div className="flex justify-between text-xs font-black text-zinc-400 uppercase tracking-widest pb-2 border-b border-zinc-900">
              <span>Item</span>
              <span>Amount</span>
            </div>

            {summaryItems.map(({ item, quantity }) => (
              <div key={item.id} className="flex justify-between items-start gap-3 py-1">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white leading-snug break-words">{item.name}</p>
                  <p className="text-xs text-zinc-400 tabular-nums mt-0.5">
                    ₹{Number(item.price).toFixed(2)} × {quantity}
                  </p>
                </div>
                <span className="text-sm font-black text-white tabular-nums flex-shrink-0">
                  ₹{(item.price * quantity).toFixed(2)}
                </span>
              </div>
            ))}

            <div className="flex justify-between items-baseline border-t border-zinc-800 pt-3 mt-1">
              <span className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Total ({cartItemsCount} {cartItemsCount === 1 ? "item" : "items"})
              </span>
              <span className="text-2xl font-black text-primary tabular-nums">₹{cartTotal.toFixed(2)}</span>
            </div>
          </div>

          <p className="text-xs text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-center">
            This amount is added to your booking — pay at the counter.
          </p>

          <div className="space-y-2 pt-1">
            <Button
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
              variant="gradient"
              className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4" />
                  Confirm Order
                </>
              )}
            </Button>
            <Button
              onClick={() => setShowSummary(false)}
              disabled={isSubmitting}
              variant="ghost"
              className="w-full text-zinc-300 border border-zinc-800 hover:text-white font-bold uppercase text-sm h-11 rounded-xl disabled:opacity-50"
            >
              ← Back to Menu
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Order Confirmation View
  if (orderConfirmed) {
    return (
      <div className="w-full max-w-2xl mx-auto py-4 px-2 animate-in fade-in duration-500">
        <Card className="bg-[#111] border border-green-500/20 p-8 shadow-2xl rounded-2xl space-y-6 glow-box-strong">
          {/* Success Header */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center">
                <UtensilsCrossed className="h-10 w-10 text-green-500" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase text-white tracking-tight">ORDER CONFIRMED!</h3>
              <p className="text-sm text-zinc-400">Your food order has been successfully placed.</p>
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 text-sm glow-box-hover">
            <h4 className="text-xs font-black text-zinc-400 uppercase">Order Items</h4>
            {confirmedItems.map((item, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-zinc-400">{item.item_name} (x{item.quantity}):</span>
                <span className="text-white font-bold">₹{item.line_total.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-zinc-800 pt-2 font-black">
              <span className="text-zinc-400">Total Amount:</span>
              <span className="text-white">₹{confirmedItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={() => {
                if (returnUrl) {
                  router.push(returnUrl);
                } else {
                  router.push(`/retrieve`);
                }
              }}
              variant="gradient"
              className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-2"
            >
              <ShoppingCart className="h-4 w-4" />
              VIEW BOOKING DETAILS
            </Button>
            <Button
              onClick={() => {
                setOrderConfirmed(false);
                setCart({});
                setConfirmedItems([]);
              }}
              variant="ghost"
              className="w-full border-2 border-primary text-zinc-300 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl"
            >
              ORDER MORE ITEMS
            </Button>
            <Button
              onClick={() => router.push("/")}
              variant="ghost"
              className="w-full text-zinc-300 border border-zinc-800 hover:text-zinc-400 font-bold uppercase text-xs h-10 rounded-xl"
            >
              BACK TO HOME
            </Button>
          </div>

          {/* Footer Note */}
          <div className="pt-2 flex gap-2 items-center text-xs text-zinc-400 justify-center border-t border-zinc-950">
            <UtensilsCrossed className="h-3.5 w-3.5 text-zinc-700" />
            <span>Your food order will be prepared and served at your station</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white pb-32 md:pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-xl md:text-2xl font-black uppercase text-white tracking-tight flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            ORDER FOOD & DRINKS
          </h1>
          <p className="text-sm text-zinc-400">Add food items to your booking</p>
        </div>

        {/* Category Filter — wraps onto multiple rows on mobile so no category is hidden off-screen */}
        <div className="flex flex-wrap gap-2 pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs font-black uppercase border rounded-xl transition-all whitespace-nowrap ${activeCategory === category
                ? "bg-gradient-primary text-[var(--button-text)] border-primary"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const inCart = cart[item.id];
            const isAvailable = item.status === 'available';
            const PlaceholderIcon = categoryIcon(item.category);

            return (
              <Card key={item.id} className={`bg-[#111] border overflow-hidden rounded-xl flex flex-col h-full ${isAvailable ? 'border-zinc-900 hover:border-primary/50' : 'border-zinc-900/50 opacity-60'} transition-all glow-box-hover`}>
                {/* Image — or its stand-in, so every card in the row is built the same */}
                {showImageStrip && (
                  <div className="h-36 md:h-40 w-full bg-zinc-950 overflow-hidden flex-shrink-0">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-950 flex items-center justify-center">
                        <PlaceholderIcon className="h-9 w-9 text-zinc-700" />
                      </div>
                    )}
                  </div>
                )}

                {/* Content — gap-3 rather than space-y-3, whose `> * ~ *` rule
                    outranks the mt-auto that floors the price row */}
                <div className="p-4 md:p-5 flex flex-col flex-1 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm md:text-base font-black uppercase text-white leading-tight">{item.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded-md font-bold uppercase whitespace-nowrap ${item.category === 'Snacks' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/30' :
                        item.category === 'Drinks' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30' :
                          'bg-green-500/10 text-green-500 border border-green-500/30'
                        }`}>
                        {item.category}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{item.description}</p>
                    )}
                  </div>

                  {/* mt-auto keeps price and BUY on the card's floor, so they
                      line up across a row however tall the row ends up */}
                  <div className="flex items-center justify-between pt-2 mt-auto">
                    <span className="text-xl font-black text-primary">₹{item.price}</span>

                    {isAvailable ? (
                      inCart ? (
                        <div className="flex items-center gap-2 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-1.5 rounded-lg shadow-md">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-all"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-sm font-black text-primary w-8 text-center">{inCart.quantity}</span>
                          <button
                            onClick={() => addToCart(item)}
                            className="p-1.5 bg-gradient-primary text-[var(--button-text)] rounded transition-all hover:scale-110"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => addToCart(item)}
                          size="sm"
                          className="bg-gradient-primary text-[var(--button-text)] font-black uppercase text-xs h-9 px-4 rounded-lg"
                        >
                          <ShoppingBag className="h-3.5 w-3.5 mr-1" /> BUY
                        </Button>
                      )
                    ) : (
                      <span className="text-xs font-bold text-zinc-400 uppercase">Out of Stock</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredItems.length === 0 && (
          <Card className="bg-[#111] border border-zinc-900 p-12 text-center">
            <Coffee className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400">No items available in this category.</p>
          </Card>
        )}

      </div>

      {/* Fixed Bottom Cart Bar */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#0d0a14] border-t border-zinc-900 p-4 md:p-5 shadow-2xl z-50 backdrop-blur-lg bg-opacity-95">
          <div className="max-w-6xl mx-auto">
            {/* Expanded Cart Items List */}
            {isCartListOpen && (
              <div className="mb-4 max-h-60 overflow-y-auto border-b border-zinc-900 pb-4 space-y-2.5 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex justify-between items-center text-xs font-black text-zinc-400 uppercase tracking-widest pb-1 border-b border-zinc-900/60">
                  <span>Selected Food Items</span>
                  <span>Quantity & Price</span>
                </div>
                {Object.values(cart).map(({ item, quantity }) => (
                  <div key={item.id} className="flex justify-between items-center text-sm py-1.5 border-b border-zinc-900/10">
                    <span className="text-white font-bold uppercase text-xs">{item.name}</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-md p-1 shadow-md">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-black text-primary w-5 text-center">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => addToCart(item)}
                          className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-primary font-black text-xs min-w-[60px] text-right">₹{item.price * quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Mobile Layout */}
            <div className="flex md:hidden flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-primary text-black rounded-full w-9 h-9 flex items-center justify-center font-black text-sm">
                    {cartItemsCount}
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400 font-semibold">Cart Total</p>
                    <p className="text-xl font-black text-primary">₹{cartTotal}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setIsCartListOpen(!isCartListOpen)}
                    variant="outline"
                    size="sm"
                    className="text-xs h-9 border-zinc-800 text-zinc-300 hover:bg-zinc-900"
                  >
                    {isCartListOpen ? "Hide Items" : "View Items"}
                  </Button>
                  <Button
                    onClick={() => {
                      setCart({});
                      setIsCartListOpen(false);
                    }}
                    variant="outline"
                    size="sm"
                    className="text-xs h-9 border-zinc-800 text-red-400 hover:bg-red-950/20"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <Button
                onClick={handleReviewOrder}
                disabled={isSubmitting}
                className="w-full bg-gradient-primary text-[var(--button-text)] font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-2"
              >
                <ShoppingCart className="h-4 w-4" />
                Review Order
              </Button>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-primary text-black rounded-full w-10 h-10 flex items-center justify-center font-black text-base">
                  {cartItemsCount}
                </div>
                <div>
                  <p className="text-xs text-zinc-400 font-semibold">Cart Total</p>
                  <p className="text-xl font-black text-primary">₹{cartTotal}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setIsCartListOpen(!isCartListOpen)}
                  variant="outline"
                  className="font-bold uppercase text-sm h-12 px-6 border-zinc-800 text-zinc-300 hover:bg-zinc-900"
                >
                  {isCartListOpen ? "Hide Items" : "View Items"}
                </Button>
                <Button
                  onClick={() => {
                    setCart({});
                    setIsCartListOpen(false);
                  }}
                  variant="outline"
                  className="font-bold uppercase text-sm h-12 px-6 border-zinc-800 text-red-400 hover:bg-red-950/20"
                >
                  Clear Cart
                </Button>
                <Button
                  onClick={handleReviewOrder}
                  disabled={isSubmitting}
                  className="bg-gradient-primary text-[var(--button-text)] font-black uppercase text-sm h-12 px-8 flex items-center gap-2 rounded-xl"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Review Order
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

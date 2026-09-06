"use client";

import { useState } from "react";
import { commitNewPromoAction } from "@/app/(admin)/admin/promo-code/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { endOfDay, format, startOfDay } from "date-fns";
import { Loader2, X, Percent, Banknote, CalendarDays, Tag, AlignLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface AddPromoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function AddPromoCodeModal({ onClose, onRefresh }: AddPromoModalProps) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Gates the submit: every starred field must be filled.
  const promoFormComplete =
    code.trim().length > 0 && discountValue.trim().length > 0 && !!dateFrom && !!dateTo;

  const handleFormSubmitCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !discountValue || !dateFrom || !dateTo) {
      toast.error("Please fill out all required fields.");
      return;
    }

    if (dateTo < dateFrom) {
      toast.error("Invalid Range: Expiry date cannot occur before start date.");
      return;
    }

    setFormSubmitting(true);

    const payload = {
      code: code.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      description,
      discount_type: discountType,
      discount_value: parseFloat(discountValue),
      // The picker deals in whole days, so the window is stored as the instants
      // that bracket them: a code set from 11 to 12 Aug runs from 11 Aug 00:00
      // right through 12 Aug 23:59:59.999. Sending a bare "yyyy-MM-dd" stored
      // the end as midnight, which killed the code as its final day began.
      valid_from: startOfDay(dateFrom).toISOString(),
      valid_until: endOfDay(dateTo).toISOString(),
      is_active: isActive,
    };

    const res = await commitNewPromoAction(payload);

    if (res.success) {
      toast.success("Promo code successfully generated.");
      onRefresh();
      onClose();
    } else {
      toast.error(res.error || "Database operation failure.");
    }
    setFormSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-3xl bg-[#09090b] border border-zinc-800/80 rounded-2xl shadow-[0_0_60px_rgba(184,134,11,0.08)] overflow-hidden animate-in zoom-in-95 duration-250">
        <div className="flex justify-between items-center p-5 border-b border-zinc-900 bg-[var(--background)]/80">
          <div>
            <h3 className="font-black text-base text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-4 bg-primary rounded-sm block shadow-primary" />
              Create New Promotion
            </h3>
            <p className="text-xs text-secondary-content font-semibold mt-0.5 tracking-wide">Configure custom campaign definitions, timelines, and value assets.</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-2 rounded-xl bg-zinc-900/50 border border-zinc-800 text-muted-content hover:text-primary hover:border-primary/40 transition-all duration-200"
          >
            <X className="h-4 w-4"/>
          </button>
        </div>

        <form onSubmit={handleFormSubmitCommit} className="p-6 space-y-6 text-left">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2 md:col-span-1">
              <Label className="text-xs font-black tracking-widest uppercase text-zinc-300 flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-primary" /> Promo Code <span className="text-red-500">*</span>
              </Label>
              <Input 
                required
                placeholder="SUMMERTREAT30"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                className="bg-[var(--background)] border-zinc-800 h-12 uppercase text-sm tracking-wider font-black text-primary placeholder-zinc-700 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs font-black tracking-widest uppercase text-zinc-300 flex items-center gap-1.5">
                <AlignLeft className="h-3 w-3 text-primary" /> Description
              </Label>
              <Textarea 
                placeholder="Enter context tags, internal notes, or client display messages..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-[var(--background)] border-zinc-800 text-sm text-zinc-200 placeholder-zinc-700 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent resize-none h-12 font-medium leading-normal transition-all py-3"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-black tracking-widest uppercase text-zinc-300 flex items-center gap-1.5">
                {discountType === "percentage" ? <Percent className="h-3 w-3 text-primary" /> : <Banknote className="h-3 w-3 text-primary" />}
                Discount Type <span className="text-red-500">*</span>
              </Label>
              <select 
                value={discountType} 
                onChange={(e) => { setDiscountType(e.target.value as any); setDiscountValue(""); }}
                className="w-full bg-[var(--background)] border border-zinc-800 rounded-xl h-12 px-3.5 text-sm text-white font-black focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent cursor-pointer appearance-none transition-all hover:border-zinc-700"
                style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23B8860B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', backgroundSize: '14px' }}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₹)</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black tracking-widest uppercase text-zinc-300">
                Discount Value <span className="text-red-500">*</span>
              </Label>
              <div className="relative flex items-center">
                <Input 
                  type="number"
                  required
                  min={1}
                  max={discountType === "percentage" ? 100 : undefined}
                  placeholder={discountType === "percentage" ? "25" : "200"}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="bg-[var(--background)] border-zinc-800 h-12 text-sm text-white placeholder-zinc-700 font-black rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all pr-14"
                />
                <span className="absolute right-2 text-xs font-black text-black bg-primary border border-primary px-2 py-1.5 rounded-lg select-none shadow-[0_0_10px_rgba(184,134,11,0.2)]">
                  {discountType === "percentage" ? "PCT" : "INR"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2 w-full">
              <Label className="text-xs font-black tracking-widest uppercase text-zinc-300 flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3 text-primary" /> Active From Date <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full bg-[var(--background)] border border-zinc-800 h-12 rounded-xl px-4 text-sm font-mono font-bold text-left flex items-center justify-between transition-all hover:border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <span>{dateFrom ? format(dateFrom, "dd-MM-yyyy") : <span className="text-muted-content">dd-mm-yyyy</span>}</span>
                    <CalendarDays className="h-4 w-4 text-primary drop-shadow-[0_0_4px_rgba(184,134,11,0.3)]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-3 bg-[var(--background)] border border-zinc-800 rounded-xl shadow-2xl z-50" align="start" side="top" sideOffset={8}>
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    className="bg-[var(--background)] text-white rounded-xl p-0"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2 w-full">
              <Label className="text-xs font-black tracking-widest uppercase text-zinc-300 flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3 text-primary" /> Expiry Date <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full bg-[var(--background)] border border-zinc-800 h-12 rounded-xl px-4 text-sm font-mono font-bold text-left flex items-center justify-between transition-all hover:border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <span>{dateTo ? format(dateTo, "dd-MM-yyyy") : <span className="text-muted-content">dd-mm-yyyy</span>}</span>
                    <CalendarDays className="h-4 w-4 text-primary drop-shadow-[0_0_4px_rgba(184,134,11,0.3)]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-3 bg-[var(--background)] border border-zinc-800 rounded-xl shadow-2xl z-50" align="start" side="top" sideOffset={8}>
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    className="bg-[var(--background)] text-white rounded-xl p-0"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-center justify-between bg-[var(--background)] border border-zinc-800/60 p-4 rounded-xl transition-all">
            <div className="space-y-0.5">
              <Label className="text-xs font-black text-white uppercase tracking-wider block flex items-center gap-1.5">
                <ShieldCheck className={`h-3.5 w-3.5 ${isActive ? "text-primary" : "text-muted-content"}`} /> Promotion Active State
              </Label>
              <span className="text-label font-medium block">If deactivated, validation processing will lock this code instantly.</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={isActive} 
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-black peer-checked:after:border-black shadow-inner" />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-900">
            <Button 
              type="button" 
              onClick={onClose} 
              variant="ghost" 
              className="border border-zinc-800 text-muted-content hover:text-white hover:bg-zinc-900 font-black text-sm h-12 px-5 rounded-xl transition-all"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={formSubmitting || !promoFormComplete} 
              className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase text-sm h-12 px-6 rounded-xl flex items-center gap-1.5 glow-box transition-all active:scale-[0.98]"
            >
              {formSubmitting ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : "Publish Promo"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
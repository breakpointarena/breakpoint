'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IndianRupee, Clock, Percent, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createSubscriptionPlan } from '@/app/(admin)/admin/subscription/actions'
import { toast } from 'sonner'
import { useRequiredFields } from '@/lib/hooks/useRequiredFields'

interface AddModalProps {
  onFormSuccess?: () => Promise<void> | void
  open: boolean
  setOpen: (open: boolean) => void
}

export function AddSubscriptionModal({ onFormSuccess, open, setOpen }: AddModalProps) {
  const [isActive, setIsActive] = useState(true)
  const [isPending, startTransition] = useTransition()
  const { formRef, isComplete, recheck } = useRequiredFields()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const targetForm = e.currentTarget

    startTransition(async () => {
      const submissionFormData = new FormData(targetForm)

      const result = await createSubscriptionPlan(submissionFormData)

      if (result.success) {
        setOpen(false)
        toast.success('Plan Created', {
          description: 'New subscription plan added successfully.',
          icon: <CheckCircle2 className="h-5 w-5 text-primary" />,
        })

        if (onFormSuccess) {
          await onFormSuccess()
        }
      } else {
        toast.error('Creation Failed', {
          description: result.error,
          icon: <AlertCircle className="h-5 w-5 text-[#f43f5e]" />,
        })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-[var(--background)] border-[#27272a] text-white max-w-2xl w-[95vw] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header Panel */}
        <div className="p-6 pr-14 border-b border-zinc-900 bg-[var(--surface)] flex-shrink-0">
          <DialogTitle className="font-black text-base text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-4 bg-primary rounded-sm block shadow-primary" />
            Add Subscription Plan
          </DialogTitle>
          <p className="text-xs text-secondary-content font-semibold mt-0.5 tracking-wide">
            Configure pricing and duration for a new membership plan.
          </p>
        </div>

        <form ref={formRef} onChange={recheck} onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <input type="hidden" name="is_active" value={isActive.toString()} />

          {/* Form Body */}
          <div className="flex-1 p-8 space-y-6 bg-[var(--background)] overflow-y-auto">
            <div className="space-y-2">
              <label className="text-xs font-black tracking-widest uppercase text-zinc-300">
                Plan Name <span className="text-red-500">*</span>
              </label>
              <Input
                name="name"
                maxLength={50}
                placeholder="e.g. Monthly Elite Pass"
                className="h-10 bg-[var(--surface)] border-[#27272a] text-sm text-white focus-visible:ring-primary focus-visible:border-primary transition-colors"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-black tracking-widest uppercase text-zinc-300">
                  Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-content pointer-events-none" />
                  <Input
                    type="number"
                    name="price"
                    step="0.01"
                    min="1"
                    placeholder="0.00"
                    className="h-10 pl-9 bg-[var(--surface)] border-[#27272a] text-sm text-white focus-visible:ring-primary focus-visible:border-primary transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black tracking-widest uppercase text-zinc-300">
                  Duration (Months) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-content pointer-events-none" />
                  <Input
                    type="number"
                    name="duration_months"
                    min="1"
                    max="60"
                    placeholder="1"
                    className="h-10 pl-9 bg-[var(--surface)] border-[#27272a] text-sm text-white focus-visible:ring-primary focus-visible:border-primary transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black tracking-widest uppercase text-zinc-300">
                  Discount (%) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-content pointer-events-none" />
                  <Input
                    type="number"
                    name="discount_percentage"
                    min="0"
                    max="100"
                    defaultValue="20"
                    className="h-10 pl-9 bg-[var(--surface)] border-[#27272a] text-sm text-white focus-visible:ring-primary focus-visible:border-primary transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black tracking-widest uppercase text-zinc-300">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                name="description"
                placeholder="List the perks, features, or restrictions of this plan..."
                className="w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary h-24 outline-none resize-none transition-colors"
                required
                minLength={10}
                maxLength={500}
              />
            </div>

            {/* Plan Status Selector - mirrors the device status segment */}
            <div className="space-y-2">
              <label className="text-xs font-black tracking-widest uppercase text-zinc-300">
                Plan Status <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                {[
                  { value: true, label: 'Active' },
                  { value: false, label: 'Inactive' },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setIsActive(option.value)}
                    className={`flex items-center justify-center rounded-lg border py-2.5 text-sm font-bold transition-all ${
                      isActive === option.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-[#27272a] bg-[var(--surface)] text-muted-content hover:border-zinc-700'
                    }`}
                  >
                    <span className="tracking-wide">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-zinc-900 bg-[var(--surface)] flex-shrink-0">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-content hover:bg-zinc-900 hover:text-white font-black uppercase text-sm tracking-wider"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !isComplete}
              className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase text-sm tracking-wider px-6 h-10 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Plan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState, useEffect, useTransition } from 'react'
import { PlusCircle } from 'lucide-react'
import { AddSubscriptionModal } from '@/components/admin/subscription/AddSubscriptionModal'
import { EditSubscriptionModal } from '@/components/admin/subscription/EditSubscriptionModal'
import { BreakpointLoader } from '@/components/shared/BreakpointLoader'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { SubscriptionTable } from '@/components/admin/subscription/SubscriptionTable'

// Import your server actions
import {
  getSubscriptionPlans,
  deleteSubscriptionPlan,
} from '@/app/(admin)/admin/subscription/actions'

export default function SubscriptionPage() {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<any | null>(null)

  // State for dynamic data and delete confirmation
  const [plans, setPlans] = useState<any[]>([])
  const [planToDelete, setPlanToDelete] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  // No isPending here: ConfirmDialog closes on confirm and the outcome is
  // reported by a toast, matching the promo code screen.
  const [, startTransition] = useTransition()

  // Function to fetch data from Supabase
  const loadPlans = async () => {
    setIsLoading(true)
    try {
      const { data } = await getSubscriptionPlans()
      setPlans(data)
    } catch (error: any) {
      toast.error('Failed to load plans', { description: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch data on initial component mount
  useEffect(() => {
    loadPlans()
  }, [])

  // Function to trigger a re-fetch after adding or editing
  const handleRefresh = async () => {
    await loadPlans()
  }

  // Opens the Alert Dialog
  const handleDeleteClick = (id: string) => {
    setPlanToDelete(id)
  }

  // Executes the actual database deletion
  const confirmDelete = () => {
    const targetId = planToDelete
    if (!targetId) return

    startTransition(async () => {
      const result = await deleteSubscriptionPlan(targetId)

      if (result.success) {
        toast.success('Plan Deleted Successfully')
        await loadPlans()
      } else {
        toast.error('Deletion Failed', { description: result.error })
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8 bg-[var(--background)] min-h-screen text-white animate-in fade-in duration-700">
      {/* HEADER PANEL */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-900 pb-5">
        <div className="animate-in slide-in-from-left-4 duration-500">
          <h1 className="text-2xl font-black uppercase tracking-tight">Subscription Management</h1>
          <p className="text-sm text-secondary-content font-medium mt-0.5">
            Configure and monitor subscription plans for gaming and refreshments.
          </p>
        </div>
        <Button
          onClick={() => setIsAddOpen(true)}
          variant="gradient"
          className="font-black uppercase text-sm h-11 px-5 rounded-lg tracking-wider flex items-center gap-2"
        >
          <PlusCircle className="h-4 w-4 stroke-[3]" /> Add Subscription
        </Button>
      </div>

      {/* MAIN TABLE AREA */}
      <div className="mt-2 animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
        {isLoading ? (
          <div className="text-center py-12 bg-[var(--surface)] border border-zinc-900 rounded-xl flex justify-center items-center gap-3 text-xs font-black uppercase tracking-wider text-muted-content">
            <BreakpointLoader size="sm" /> Loading subscription plans
          </div>
        ) : (
          <SubscriptionTable
            data={plans}
            onEdit={plan => setEditingPlan(plan)}
            onDelete={handleDeleteClick}
          />
        )}
      </div>

      {/* ADD / EDIT MODALS */}
      <AddSubscriptionModal open={isAddOpen} setOpen={setIsAddOpen} onFormSuccess={handleRefresh} />

      {editingPlan && (
        <EditSubscriptionModal
          plan={editingPlan}
          open={!!editingPlan}
          setOpen={val => !val && setEditingPlan(null)}
          onFormSuccess={handleRefresh}
        />
      )}

      {/* DELETE CONFIRMATION - shared dialog, same as the promo code screen */}
      <ConfirmDialog
        isOpen={!!planToDelete}
        onClose={() => setPlanToDelete(null)}
        onConfirm={confirmDelete}
        title="Remove Subscription Plan"
        description="Are you sure you want to delete this subscription plan? This drops the plan completely from your database configuration mapping and cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  )
}

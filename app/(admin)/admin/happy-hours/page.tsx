// 'use client'

// import { useState, useEffect, useTransition } from 'react'
// import { PlusCircle, Timer, Loader2 } from 'lucide-react'
// import { Button } from '@/components/ui/button'
// import { toast } from 'sonner'

// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
// } from '@/components/ui/alert-dialog'
// import { EditHappyHourModal } from '@/components/admin/happy-hours/EditHappyHourModal'
// import { AddHappyHourModal } from '@/components/admin/happy-hours/AddHappyHourModal'
// import { HappyHourTable } from '@/components/admin/happy-hours/HappyHourTable'

// export default function HappyHoursPage() {
//   const [isAddOpen, setIsAddOpen] = useState(false)
//   const [editingRule, setEditingRule] = useState<any | null>(null)
//   const [rules, setRules] = useState<any[]>([])
//   const [ruleToDelete, setRuleToDelete] = useState<string | null>(null)
//   const [isLoading, setIsLoading] = useState(true)
//   const [isPending, startTransition] = useTransition()

//   const loadRules = async () => {
//     setIsLoading(true)
//     try {
//       setTimeout(() => {
//         setRules([
//           { id: '1', name: 'Weekend Blitz', discount: 30, devices: 'PS, PC, XR +12', schedule: 'Sat, Sun', time: '10:00 AM - 04:00 PM', status: 'LIVE' },
//           { id: '2', name: 'Early Bird Special', discount: 50, devices: 'All PC Stations', schedule: 'Mon - Fri', time: '08:00 AM - 11:00 AM', status: 'PAUSED' },
//           { id: '3', name: 'Night Owl Grind', discount: 20, devices: 'VIP Lounge (8)', schedule: 'Everyday', time: '11:00 PM - 04:00 AM', status: 'SCHEDULED' },
//           { id: '4', name: 'Tournament Prep', discount: 15, devices: 'Pro Arena (20)', schedule: 'Wednesdays', time: '12:00 PM - 06:00 PM', status: 'SCHEDULED' },
//         ])
//         setIsLoading(false)
//       }, 800)
//     } catch (error: any) {
//       toast.error('Failed to load rules')
//       setIsLoading(false)
//     }
//   }

//   useEffect(() => {
//     loadRules()
//   }, [])

//   const handleRefresh = async () => await loadRules()
//   const handleDeleteClick = (id: string) => setRuleToDelete(id)

//   const confirmDelete = () => {
//     if (!ruleToDelete) return
//     startTransition(async () => {
//       setTimeout(async () => {
//         toast.success('Rule Deleted Successfully')
//         await loadRules()
//         setRuleToDelete(null)
//       }, 500)
//     })
//   }

//   return (
//     // Changed p-4 sm:p-8 to p-3 md:p-8 for better mobile edge-to-edge look
//     <div className="flex flex-col gap-6 p-3 md:p-8 bg-[#0a0a0a] min-h-screen text-white animate-in fade-in duration-700">
      
//       {/* HEADER PANEL - Allows button to span full width on small screens */}
//       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
//         <div className="space-y-1 animate-in slide-in-from-left-4 duration-500">
//           <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">Happy Hours Management</h1>
//           <p className="text-[#a1a1aa] text-sm leading-snug">
//             Configure automated pricing rules for peak and off-peak gaming sessions.
//           </p>
//         </div>
//         <Button
//           onClick={() => setIsAddOpen(true)}
//           className="w-full md:w-auto bg-gradient-primary hover:bg-gradient-primary-hover text-black font-semibold rounded-md px-6 py-5 md:py-2 transition-all duration-300 shadow-[0_0_15px_rgba(255,193,7,0.15)]"
//         >
//           <PlusCircle className="mr-2 h-5 w-5 md:h-4 md:w-4" /> Create Rule
//         </Button>
//       </div>

//       {/* SUMMARY CARDS - Grids adjust perfectly from 1 to 2 to 3 cols */}
//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-bottom-4 duration-700">
//         <div className="bg-[var(--surface)] border border-[#27272a] rounded-xl p-5 flex flex-col gap-2">
//           <div className="flex justify-between items-center w-full">
//             <Timer className="text-primary h-5 w-5" />
//             <span className="text-sm font-semibold text-primary bg-primary/10 px-2 py-1 rounded-md">Active Now</span>
//           </div>
//           <p className="text-[#a1a1aa] text-sm uppercase tracking-wider mt-2">Currently Running</p>
//           <h2 className="text-xl font-bold text-white">Weekend Blitz</h2>
//           <p className="text-[#a1a1aa] text-sm mt-1">Ends in 02h 45m</p>
//         </div>

//         <div className="bg-[var(--surface)] border border-[#27272a] rounded-xl p-5 flex flex-col gap-2">
//           <div className="flex justify-between items-center w-full">
//              <div className="text-primary flex gap-1">
//                 <div className="h-4 w-3 border-2 border-current rounded-sm"></div>
//                 <div className="h-5 w-4 border-2 border-current rounded-sm"></div>
//              </div>
//           </div>
//           <p className="text-[#a1a1aa] text-sm uppercase tracking-wider mt-2">Coverage</p>
//           <h2 className="text-xl font-bold text-white">85%</h2>
//           <p className="text-[#a1a1aa] text-sm mt-1">42 Devices Assigned</p>
//         </div>
//       </div>

//       {/* MAIN TABLE AREA */}
//       <div className="mt-2 animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both bg-[var(--surface)] border border-[#27272a] rounded-xl p-4 md:p-6">
//         <div className="flex justify-between items-center mb-6">
//             <h2 className="text-base md:text-lg font-bold text-white">Active Rules Configuration</h2>
//             <div className="flex gap-3 text-[#a1a1aa]">
//                 <button className="hover:text-white transition-colors p-1"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></button>
//                 <button className="hover:text-white transition-colors p-1"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>
//             </div>
//         </div>
        
//         {isLoading ? (
//           <div className="flex flex-col items-center justify-center py-20 text-[#a1a1aa] gap-3">
//             <BreakpointLoader size="lg" />
//             <p className="text-sm font-medium">Loading rules...</p>
//           </div>
//         ) : (
//           <HappyHourTable data={rules} onEdit={setEditingRule} onDelete={handleDeleteClick} />
//         )}
//       </div>

//       <AddHappyHourModal open={isAddOpen} setOpen={setIsAddOpen} onFormSuccess={handleRefresh} />
//       {editingRule && <EditHappyHourModal rule={editingRule} open={!!editingRule} setOpen={val => !val && setEditingRule(null)} onFormSuccess={handleRefresh} />}

//       <AlertDialog open={!!ruleToDelete} onOpenChange={open => !open && setRuleToDelete(null)}>
//         <AlertDialogContent className="w-[90vw] max-w-[500px] bg-[var(--surface)] border border-[#27272a] text-white rounded-xl">
//           <AlertDialogHeader>
//             <AlertDialogTitle className="text-lg md:text-xl font-bold">Remove Pricing Rule?</AlertDialogTitle>
//             <AlertDialogDescription className="text-[#a1a1aa] text-sm">
//               Are you sure you want to delete this happy hour rule? It will no longer apply to your configured devices.
//             </AlertDialogDescription>
//           </AlertDialogHeader>
//           <AlertDialogFooter className="mt-4 flex-col sm:flex-row gap-3">
//             <AlertDialogCancel disabled={isPending} className="w-full sm:w-auto bg-[#27272a] text-white border-zinc-700 hover:bg-zinc-800">
//               Cancel
//             </AlertDialogCancel>
//             <AlertDialogAction onClick={e => { e.preventDefault(); confirmDelete(); }} disabled={isPending} className="w-full sm:w-auto bg-gradient-primary text-black hover:bg-gradient-primary/90 font-semibold flex items-center justify-center">
//               {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Confirm Delete'}
//             </AlertDialogAction>
//           </AlertDialogFooter>
//         </AlertDialogContent>
//       </AlertDialog>
//     </div>
//   )
// }

'use client'

import { useState, useEffect, useTransition } from 'react'
import { PlusCircle, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EditHappyHourModal } from '@/components/admin/happy-hours/EditHappyHourModal'
import { AddHappyHourModal } from '@/components/admin/happy-hours/AddHappyHourModal'
import { HappyHourTable } from '@/components/admin/happy-hours/HappyHourTable'
import { deleteHappyHour, getHappyHours } from '@/components/admin/happy-hours/action'
import { BreakpointLoader } from '@/components/shared/BreakpointLoader'

// TODO: Update this import path to match where you saved your CRUD Server Actions

export default function HappyHoursPage() {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<any | null>(null)
  
  // State for dynamic data and delete confirmation
  const [rules, setRules] = useState<any[]>([])
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null)
  
  const [isLoading, setIsLoading] = useState(true)
  // No isPending here: ConfirmDialog closes on confirm and the outcome is
  // reported by a toast, matching the promo code screen.
  const [, startTransition] = useTransition()

  // Fetch data dynamically from Supabase
  const loadRules = async () => {
    setIsLoading(true)
    try {
      const result = await getHappyHours()
      if (result.success) {
        setRules(result.data || [])
      } else {
        toast.error('Failed to load rules', { description: result.error })
      }
    } catch (error: any) {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch data on initial component mount
  useEffect(() => {
    loadRules()
  }, [])

  // Function to trigger a re-fetch after adding or editing
  const handleRefresh = async () => await loadRules()
  
  // Opens the Alert Dialog
  const handleDeleteClick = (id: string) => setRuleToDelete(id)

  // Executes the actual database deletion dynamically
  const confirmDelete = () => {
    const targetId = ruleToDelete
    if (!targetId) return

    startTransition(async () => {
      const result = await deleteHappyHour(targetId)

      if (result.success) {
        toast.success('Rule Deleted Successfully')
        await loadRules()
      } else {
        toast.error('Failed to delete rule', { description: result.error })
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 p-3 md:p-8 bg-[var(--background)] min-h-screen text-white animate-in fade-in duration-700">
      
      {/* HEADER PANEL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-900 pb-5">
        <div className="animate-in slide-in-from-left-4 duration-500">
          <h1 className="text-2xl font-black uppercase tracking-tight">Happy Hours Management</h1>
          <p className="text-sm text-secondary-content font-medium mt-0.5">
            Configure automated pricing rules for peak and off-peak gaming sessions.
          </p>
        </div>
        <Button
          onClick={() => setIsAddOpen(true)}
          variant="gradient"
          className="w-full md:w-auto font-black uppercase text-sm h-11 px-5 rounded-lg tracking-wider flex items-center gap-2"
        >
          <PlusCircle className="h-4 w-4 stroke-[3]" /> Create Rule
        </Button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-bottom-4 duration-700">
        <div className="bg-[var(--surface)] border border-zinc-900 rounded-xl p-5 flex flex-col gap-2">
          <div className="flex justify-between items-center w-full">
            <Timer className="text-primary h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">Active Now</span>
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-muted-content mt-2">Currently Running</p>
          {/* You could make this dynamic by filtering the 'rules' array for status === 'LIVE' */}
          <h2 className="text-xl font-black text-white uppercase tracking-tight">
            {rules.find(r => r.status === 'LIVE')?.name || 'None Active'}
          </h2>
          <p className="text-sm text-secondary-content font-medium mt-1">Status check complete</p>
        </div>

        <div className="bg-[var(--surface)] border border-zinc-900 rounded-xl p-5 flex flex-col gap-2">
          <div className="flex justify-between items-center w-full">
             <div className="text-primary flex gap-1">
                <div className="h-4 w-3 border-2 border-current rounded-sm"></div>
                <div className="h-5 w-4 border-2 border-current rounded-sm"></div>
             </div>
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-muted-content mt-2">Total Rules</p>
          <h2 className="text-xl font-black text-white uppercase tracking-tight">{rules.length} Configured</h2>
          <p className="text-sm text-secondary-content font-medium mt-1">Across all devices</p>
        </div>
      </div>

      {/* MAIN TABLE AREA */}
      {/* No card styling here - HappyHourTable is itself the bordered card, the
          same shape the subscription screen uses. */}
      <div className="mt-2 animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
        {isLoading ? (
          <div className="text-center py-12 bg-[var(--surface)] border border-zinc-900 rounded-xl flex justify-center items-center gap-3 text-xs font-black uppercase tracking-wider text-muted-content">
            <BreakpointLoader size="sm" /> Loading happy hour rules
          </div>
        ) : (
          <HappyHourTable data={rules} onEdit={setEditingRule} onDelete={handleDeleteClick} />
        )}
      </div>

      <AddHappyHourModal open={isAddOpen} setOpen={setIsAddOpen} onFormSuccess={handleRefresh} />
      {editingRule && <EditHappyHourModal rule={editingRule} open={!!editingRule} setOpen={val => !val && setEditingRule(null)} onFormSuccess={handleRefresh} />}

      {/* DELETE CONFIRMATION - shared dialog, same as the promo code screen */}
      <ConfirmDialog
        isOpen={!!ruleToDelete}
        onClose={() => setRuleToDelete(null)}
        onConfirm={confirmDelete}
        title="Remove Pricing Rule"
        description="Are you sure you want to delete this happy hour rule? It will no longer apply to your configured devices. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  )
}

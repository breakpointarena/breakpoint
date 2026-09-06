'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimeOfDayField } from '@/components/ui/time-of-day-field'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRequiredFields } from '@/lib/hooks/useRequiredFields'
import { formatDbTimeRange, formatTo24Hour } from '@/lib/utils/timeSlots'

// Update this path to match your actual actions file
import { getDeviceTypes, updateHappyHour } from './action'

interface EditModalProps {
  rule: any
  open: boolean
  setOpen: (open: boolean) => void
  onFormSuccess: () => void
}

const DAYS_ABBR = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']


export function EditHappyHourModal({ rule, open, setOpen, onFormSuccess }: EditModalProps) {
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [deviceTypes, setDeviceTypes] = useState<any[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { formRef, isComplete, recheck } = useRequiredFields()

  // Fetch device types and parse existing rule data
  useEffect(() => {
    if (open && rule) {
      // 1. Fetch the dynamic device type list
      const loadDeviceTypes = async () => {
        setIsLoadingDevices(true)
        try {
          const data = await getDeviceTypes()
          setDeviceTypes(data)
        } catch (error) {
          console.error('Failed to load device types:', error)
          toast.error("Failed to fetch device types.")
        } finally {
          setIsLoadingDevices(false)
        }
      }
      loadDeviceTypes()

      // 2. Parse the saved 'schedule' string back into numeric indices
      if (rule.schedule) {
        const savedDays = rule.schedule.split(', ')
        const indices = savedDays.map((d: string) => DAYS_FULL.indexOf(d)).filter((i: number) => i !== -1)
        setSelectedDays(indices)
      }
    }
  }, [open, rule])

  const toggleDay = (index: number) => {
    setSelectedDays(prev => prev.includes(index) ? prev.filter(d => d !== index) : [...prev, index])
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (selectedDays.length === 0) {
      toast.error("Please select at least one day for the promotion.")
      return
    }

    setIsSubmitting(true)

    try {
      // 1. Gather all form data
      const formData = new FormData(e.currentTarget)
      const promotionName = formData.get('promotionName') as string
      const discount = Number(formData.get('discount'))
      const startTime = formData.get('startTime') as string
      const endTime = formData.get('endTime') as string
      const deviceTypeId = formData.get('device') as string
      const status = formData.get('status') as 'LIVE' | 'PAUSED' | 'SCHEDULED' // Extract Status

      // 2. Format specific fields for the database
      const scheduleString = selectedDays
        .sort((a, b) => a - b)
        .map(idx => DAYS_FULL[idx])
        .join(', ')

      // Stored as the display range the pricing rules read back:
      // "06:00 PM - 09:00 PM". The field submits 24-hour, as the time inputs
      // always did, so only the entry has changed.
      const timeRangeString = formatDbTimeRange(startTime, endTime)

      // Stored as the plain device type name, because that is the only
      // granularity `isDeviceEligible` actually checks against.
      const selectedType = deviceTypes.find(t => t.id === deviceTypeId)
      const deviceLabel = selectedType
        ? (selectedType.display_name || selectedType.name)
        : 'All Devices'

      // 3. Construct the payload
      const payload = {
        name: promotionName,
        discount: discount,
        devices: deviceLabel,
        schedule: scheduleString,
        time_range: timeRangeString,
        status: status // Pass updated status
      }

      // 4. Send the update to the database using the rule's ID
      const result = await updateHappyHour(rule.id, payload)

      if (result.success) {
        toast.success("Happy Hour rule updated successfully!")
        onFormSuccess()
        setOpen(false)
      } else {
        toast.error("Failed to update rule", { description: result.error })
      }

    } catch (error: any) {
      toast.error("An unexpected error occurred.")
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!rule) return null

  // --- Parsing Default Values for the Form ---

  // Stored as "HH:MM AM/PM - HH:MM AM/PM"; the field takes 24-hour, and turns it
  // back into hour, minute and AM/PM for the three selects.
  let defaultStart = "00:00"
  let defaultEnd = "00:00"
  if (rule?.time_range && rule.time_range.includes(' - ')) {
    const parts = rule.time_range.split(' - ')
    defaultStart = formatTo24Hour(parts[0].trim())
    defaultEnd = formatTo24Hour(parts[1].trim())
  }

  // Find the matching device type based on the saved label to set the dropdown
  // default value. "All PC Stations" is the legacy label older rules were saved
  // with before this only ever selected a device type; treated the same as
  // "All Devices" so those rules still default the dropdown correctly.
  let defaultDeviceId = 'all'
  if (rule?.devices && rule.devices !== 'All PC Stations' && rule.devices !== 'All Devices') {
    const matchedType = deviceTypes.find(t => (t.display_name || t.name) === rule.devices)
    if (matchedType) defaultDeviceId = matchedType.id
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && setOpen(val)}>
      <DialogContent className="bg-[var(--background)] border-[#27272a] text-white max-w-2xl w-[95vw] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header Panel */}
        <div className="p-6 pr-14 border-b border-zinc-900 bg-[var(--surface)] flex-shrink-0">
          <DialogTitle className="font-black text-base text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-4 bg-primary rounded-sm block shadow-primary" />
            Edit Happy Hour
          </DialogTitle>
          <p className="text-xs text-secondary-content font-semibold mt-0.5 tracking-wide">
            Update the pricing rules and schedule for this promotion.
          </p>
        </div>

        <form ref={formRef} onChange={recheck} onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="flex-1 p-8 space-y-6 bg-[var(--background)] overflow-y-auto">

            {/* Row 1: Promotion Name (Full Width) */}
            <div className="space-y-2">
              <label className="text-xs font-black tracking-widest uppercase text-zinc-300">Promotion Name <span className="text-red-500">*</span></label>
              <Input
                name="promotionName"
                defaultValue={rule.name}
                className="h-10 bg-[var(--surface)] border-[#27272a] text-sm text-white focus-visible:ring-primary focus-visible:border-primary transition-colors"
                required
              />
            </div>

            {/* Row 2: Select Days */}
            <div className="space-y-2">
              <label className="text-xs font-black tracking-widest uppercase text-zinc-300">Select Days <span className="text-red-500">*</span></label>
              <div className="flex flex-row justify-between sm:justify-start gap-1 sm:gap-2 mt-1 w-full overflow-x-auto pb-1 no-scrollbar">
                {DAYS_ABBR.map((day, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`flex-1 sm:flex-initial w-9 h-9 min-w-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all border ${
                      selectedDays.includes(idx)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-[#27272a] bg-[var(--surface)] text-muted-content hover:border-zinc-700'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Discount & Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-black tracking-widest uppercase text-zinc-300">Discount (%) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Input
                    type="number"
                    name="discount"
                    defaultValue={rule.discount}
                    min={0}
                    max={100}
                    className="h-10 pr-8 bg-[var(--surface)] border-[#27272a] text-sm text-white focus-visible:ring-primary focus-visible:border-primary transition-colors"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-content text-sm pointer-events-none">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black tracking-widest uppercase text-zinc-300">Status <span className="text-red-500">*</span></label>
                <select
                  name="status"
                  className="flex h-10 w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none text-white cursor-pointer transition-colors"
                  required
                  defaultValue={rule.status || "SCHEDULED"}
                >
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="LIVE">Live</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </div>
            </div>

            {/* Row 4: Time Range & Applies To Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-black tracking-widest uppercase text-zinc-300">Time Range <span className="text-red-500">*</span></label>
                <div className="flex flex-wrap items-center gap-2">
                  <TimeOfDayField
                    name="startTime"
                    label="Start time"
                    defaultValue={defaultStart}
                    required
                  />
                  <span className="text-muted-content text-sm">to</span>
                  <TimeOfDayField
                    name="endTime"
                    label="End time"
                    defaultValue={defaultEnd}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black tracking-widest uppercase text-zinc-300">Applies To <span className="text-red-500">*</span></label>
                <select
                  name="device"
                  className="flex h-10 w-full rounded-md border border-[#27272a] bg-[var(--surface)] px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none text-white cursor-pointer transition-colors"
                  required
                  defaultValue={defaultDeviceId}
                  key={defaultDeviceId} // Adding key forces React to re-render the select default value once devices load
                >
                  <option value="all">All Devices</option>
                  {isLoadingDevices ? (
                    <option value="loading" disabled>Loading device types...</option>
                  ) : (
                    deviceTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.display_name || type.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-zinc-900 bg-[var(--surface)] flex-shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
              className="text-muted-content hover:bg-zinc-900 hover:text-white font-black uppercase text-sm tracking-wider"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !isComplete || selectedDays.length === 0}
              className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase text-sm tracking-wider px-6 h-10 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

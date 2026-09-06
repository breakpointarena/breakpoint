import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface BookingState {
  // Device Type selection (not individual device)
  deviceTypeId: string | null
  deviceTypeName: string | null
  hourlyRate: number | null
  includedPlayers: number
  maxPlayers: number
  extraPlayerCharge: number

  // Assigned device (auto-assigned after booking)
  assignedDeviceId: string | null
  assignedStationNumber: string | null

  // Slot selection
  selectedDate: string | null
  selectedSlot: string | null
  slotStartTime: string | null
  slotEndTime: string | null
  selectedDuration: number | null
  playerCount: number

  // Add-ons
  addons: Array<{
    id: string
    name: string
    price: number
    quantity: number
  }>

  // Pricing
  subtotal: number
  subscriptionDiscount: number
  promoDiscount: number
  promoCode: string | null
  happyHourDiscount: number
  happyHourRuleId: string | null
  happyHourRuleName: string | null
  total: number

  // Customer details
  phone: string | null
  name: string | null
  email: string | null
  date_of_birth: string | null

  // Subscription info
  activeSubscriptionId: string | null
  subscriptionPlanName: string | null
  subscriptionDiscountPercentage: number
  subscriptionEndDate: string | null

  // Booking state
  bookingId: string | null
  /** Proves this browser owns the server-side hold behind `bookingId`. */
  holdToken: string | null
  slotLockExpiry: number | null

  /**
   * Whether the sessionStorage snapshot has been read back into this store yet.
   *
   * Redux starts empty on every page load, so a guard like "no device type, go
   * back to device selection" would fire on the first tick of a refresh - before
   * the restore ran - and bounce a customer who was mid-flow. Pages that redirect
   * on missing booking state must wait for this.
   */
  hydrated: boolean
}

const initialState: BookingState = {
  deviceTypeId: null,
  deviceTypeName: null,
  hourlyRate: null,
  includedPlayers: 1,
  maxPlayers: 1,
  extraPlayerCharge: 0,
  assignedDeviceId: null,
  assignedStationNumber: null,
  selectedDate: null,
  selectedSlot: null,
  slotStartTime: null,
  slotEndTime: null,
  selectedDuration: null,
  playerCount: 1,
  addons: [],
  subtotal: 0,
  subscriptionDiscount: 0,
  promoDiscount: 0,
  promoCode: null,
  happyHourDiscount: 0,
  happyHourRuleId: null,
  happyHourRuleName: null,
  total: 0,
  phone: null,
  name: null,
  email: null,
  date_of_birth: null,
  activeSubscriptionId: null,
  subscriptionPlanName: null,
  subscriptionDiscountPercentage: 0,
  subscriptionEndDate: null,
  bookingId: null,
  holdToken: null,
  slotLockExpiry: null,
  hydrated: false,
}

export const bookingSlice = createSlice({
  name: 'booking',
  initialState,
  reducers: {
    setDeviceType: (state, action: PayloadAction<{
      id: string
      name: string
      hourlyRate: number
      includedPlayers: number
      maxPlayers: number
      extraPlayerCharge: number
    }>) => {
      state.deviceTypeId = action.payload.id
      state.deviceTypeName = action.payload.name
      state.hourlyRate = action.payload.hourlyRate
      state.includedPlayers = action.payload.includedPlayers
      state.maxPlayers = action.payload.maxPlayers
      state.extraPlayerCharge = action.payload.extraPlayerCharge
      state.playerCount = action.payload.includedPlayers // Reset to included players when device type changes
    },

    setAssignedDevice: (state, action: PayloadAction<{
      deviceId: string
      stationNumber: string
    }>) => {
      state.assignedDeviceId = action.payload.deviceId
      state.assignedStationNumber = action.payload.stationNumber
    },

    setPlayerCount: (state, action: PayloadAction<number>) => {
      state.playerCount = action.payload
    },

    setSlot: (state, action: PayloadAction<{
      date: string
      slot: string
      startTime: string
      endTime: string
    }>) => {
      state.selectedDate = action.payload.date
      state.selectedSlot = action.payload.slot
      state.slotStartTime = action.payload.startTime
      state.slotEndTime = action.payload.endTime
    },

    addAddon: (state, action: PayloadAction<{
      id: string
      name: string
      price: number
    }>) => {
      const existing = state.addons.find(a => a.id === action.payload.id)
      if (existing) {
        existing.quantity += 1
      } else {
        state.addons.push({ ...action.payload, quantity: 1 })
      }
    },

    removeAddon: (state, action: PayloadAction<string>) => {
      const index = state.addons.findIndex(a => a.id === action.payload)
      if (index !== -1) {
        if (state.addons[index].quantity > 1) {
          state.addons[index].quantity -= 1
        } else {
          state.addons.splice(index, 1)
        }
      }
    },

    setPricing: (state, action: PayloadAction<{
      subtotal: number
      subscriptionDiscount: number
      promoDiscount: number
      happyHourDiscount?: number
      total: number
    }>) => {
      state.subtotal = action.payload.subtotal
      state.subscriptionDiscount = action.payload.subscriptionDiscount
      state.promoDiscount = action.payload.promoDiscount
      state.happyHourDiscount = action.payload.happyHourDiscount || 0
      state.total = action.payload.total
    },

    setHappyHour: (state, action: PayloadAction<{
      ruleId: string | null
      ruleName: string | null
      discount: number
    }>) => {
      state.happyHourRuleId = action.payload.ruleId
      state.happyHourRuleName = action.payload.ruleName
      state.happyHourDiscount = action.payload.discount
    },

    setPromoCode: (state, action: PayloadAction<string | null>) => {
      state.promoCode = action.payload
    },

    setCustomerDetails: (state, action: PayloadAction<{
      phone: string
      name: string
      email?: string
      date_of_birth: string
    }>) => {
      state.phone = action.payload.phone
      state.name = action.payload.name
      state.email = action.payload.email || null
      state.date_of_birth = action.payload.date_of_birth
    },

    setSubscription: (state, action: PayloadAction<{
      id: string
      planName: string
      discountPercentage: number
      endDate: string
    } | null>) => {
      if (action.payload) {
        state.activeSubscriptionId = action.payload.id
        state.subscriptionPlanName = action.payload.planName
        state.subscriptionDiscountPercentage = action.payload.discountPercentage
        state.subscriptionEndDate = action.payload.endDate
      } else {
        state.activeSubscriptionId = null
        state.subscriptionPlanName = null
        state.subscriptionDiscountPercentage = 0
        state.subscriptionEndDate = null
      }
    },

    setBookingId: (state, action: PayloadAction<string>) => {
      state.bookingId = action.payload
    },

    /** The server-side hold: its booking row, the token proving it is ours, its deadline. */
    setSlotHold: (
      state,
      action: PayloadAction<{ bookingId: string; holdToken: string; expiresAt: number }>
    ) => {
      state.bookingId = action.payload.bookingId
      state.holdToken = action.payload.holdToken
      state.slotLockExpiry = action.payload.expiresAt
    },

    setSlotLockExpiry: (state, action: PayloadAction<number>) => {
      state.slotLockExpiry = action.payload
    },

    setDuration: (state, action: PayloadAction<number>) => {
      state.selectedDuration = action.payload;
    },

    clearSlotTimer: (state) => {
      state.slotLockExpiry = null; // Only stops the countdown
    },

    releaseSlotHold: (state) => {
      state.slotLockExpiry = null;
      state.selectedSlot = null;
      state.slotStartTime = null;
      state.slotEndTime = null;
      // The row on the server is released separately; dropping the token here
      // stops a stale hold being offered as proof of a reservation we gave up.
      state.holdToken = null;
      state.bookingId = null;
    },

    /**
     * Fold the snapshot left by a previous page load back into the store.
     *
     * Dispatched once per load even when there is nothing stored, because the
     * point is as much to flip `hydrated` as to carry the values across: that is
     * the signal the routing guards wait on.
     */
    restoreBooking: (state, action: PayloadAction<Partial<BookingState> | null>) => ({
      ...state,
      ...(action.payload ?? {}),
      hydrated: true,
    }),

    /** Starting over clears the booking, not the fact that this tab has hydrated. */
    resetBooking: (state) => ({ ...initialState, hydrated: state.hydrated }),
  },
})

export const {
  setDeviceType,
  setAssignedDevice,
  setSlot,
  setPlayerCount,
  addAddon,
  removeAddon,
  setPricing,
  setPromoCode,
  setHappyHour,
  setCustomerDetails,
  setSubscription,
  setBookingId,
  setSlotHold,
  setSlotLockExpiry,
  setDuration,
  clearSlotTimer,
  releaseSlotHold,
  restoreBooking,
  resetBooking,
} = bookingSlice.actions

export default bookingSlice.reducer

import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface SessionState {
  phone: string | null
  isVerified: boolean
  sessionExpiry: number | null
  subscription: {
    isActive: boolean
    planName: string | null
    discountType: 'percentage' | 'fixed' | null
    discountValue: number | null
    validUntil: string | null
  } | null
}

const initialState: SessionState = {
  phone: null,
  isVerified: false,
  sessionExpiry: null,
  subscription: null,
}

export const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setSession: (state, action: PayloadAction<{
      phone: string
      sessionExpiry: number
    }>) => {
      state.phone = action.payload.phone
      state.isVerified = true
      state.sessionExpiry = action.payload.sessionExpiry
    },

    setSubscription: (state, action: PayloadAction<{
      isActive: boolean
      planName: string
      discountType: 'percentage' | 'fixed'
      discountValue: number
      validUntil: string
    }>) => {
      state.subscription = action.payload
    },

    clearSubscription: (state) => {
      state.subscription = null
    },

    clearSession: () => initialState,
  },
})

export const {
  setSession,
  setSubscription,
  clearSubscription,
  clearSession,
} = sessionSlice.actions

export default sessionSlice.reducer

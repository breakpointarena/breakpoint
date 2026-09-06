import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface AdminState {
  isAuthenticated: boolean
  username: string | null
  filters: {
    dateRange: { from: string | null; to: string | null }
    deviceFilter: string | null
    statusFilter: string | null
  }
}

const initialState: AdminState = {
  isAuthenticated: false,
  username: null,
  filters: {
    dateRange: { from: null, to: null },
    deviceFilter: null,
    statusFilter: null,
  },
}

export const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    setAdminAuth: (state, action: PayloadAction<{ username: string }>) => {
      state.isAuthenticated = true
      state.username = action.payload.username
    },

    setFilters: (state, action: PayloadAction<Partial<AdminState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },

    clearAdminAuth: () => initialState,
  },
})

export const { setAdminAuth, setFilters, clearAdminAuth } = adminSlice.actions

export default adminSlice.reducer

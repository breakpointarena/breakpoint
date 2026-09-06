import { configureStore } from '@reduxjs/toolkit'
import bookingReducer from './slices/bookingSlice'
import sessionReducer from './slices/sessionSlice'
import adminReducer from './slices/adminSlice'
import foodCartReducer from './slices/foodCartSlice'

export const makeStore = () => {
  return configureStore({
    reducer: {
      booking: bookingReducer,
      session: sessionReducer,
      admin: adminReducer,
      foodCart: foodCartReducer,
    },
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']

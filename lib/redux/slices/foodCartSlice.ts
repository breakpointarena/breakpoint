import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface FoodCartItem {
  menu_item_id: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  image_url?: string;
  /**
   * How many of these the kitchen had when this line was last touched.
   *
   * Carried on the line so the cap travels with it. The checkout page has a
   * stepper on every row and no menu to consult - it knows the cart and nothing
   * else - so a limit it has to look up is a limit it will not apply. This is a
   * reading taken at a moment, not a reservation; the server re-checks stock
   * when the order is priced, which is what actually stops an oversell.
   */
  available: number;
}

/** Missing on a line from before this field existed; let the server rule on it. */
const capOf = (item: FoodCartItem) =>
  typeof item.available === "number" ? item.available : Infinity;

interface FoodCartState {
  items: FoodCartItem[];
  bookingId: string | null;
  bookingNumber: string | null;
  customerPhone: string | null;
  customerName: string | null;
  customerDob: string | null;
}

const initialState: FoodCartState = {
  items: [],
  bookingId: null,
  bookingNumber: null,
  customerPhone: null,
  customerName: null,
  customerDob: null
};

const foodCartSlice = createSlice({
  name: "foodCart",
  initialState,
  reducers: {
    /**
     * The cap is enforced here rather than only at the button.
     *
     * Three call sites reach this cart - the menu's Add, the stepper beside each
     * menu card, and the stepper on the checkout page - and two of them dispatched
     * straight through with no check at all. A rule that lives in the reducer
     * cannot be walked around by the next button somebody adds.
     */
    addToCart: (state, action: PayloadAction<Omit<FoodCartItem, "quantity">>) => {
      const existingItem = state.items.find(
        (item) => item.menu_item_id === action.payload.menu_item_id
      );

      if (existingItem) {
        // Whatever the menu says now is fresher than what this line was carrying.
        existingItem.available = action.payload.available;
        if (existingItem.quantity < capOf(existingItem)) {
          existingItem.quantity += 1;
        }
      } else if (action.payload.available > 0) {
        state.items.push({ ...action.payload, quantity: 1 });
      }
    },

    removeFromCart: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(
        (item) => item.menu_item_id !== action.payload
      );
    },

    updateQuantity: (
      state,
      action: PayloadAction<{ menu_item_id: string; quantity: number }>
    ) => {
      const item = state.items.find(
        (item) => item.menu_item_id === action.payload.menu_item_id
      );

      if (item) {
        if (action.payload.quantity <= 0) {
          state.items = state.items.filter(
            (item) => item.menu_item_id !== action.payload.menu_item_id
          );
        } else {
          item.quantity = Math.min(action.payload.quantity, capOf(item));
        }
      }
    },

    incrementQuantity: (state, action: PayloadAction<string>) => {
      const item = state.items.find(
        (item) => item.menu_item_id === action.payload
      );
      if (item && item.quantity < capOf(item)) {
        item.quantity += 1;
      }
    },

    decrementQuantity: (state, action: PayloadAction<string>) => {
      const item = state.items.find(
        (item) => item.menu_item_id === action.payload
      );
      if (item) {
        if (item.quantity > 1) {
          item.quantity -= 1;
        } else {
          state.items = state.items.filter(
            (i) => i.menu_item_id !== action.payload
          );
        }
      }
    },

    setBookingContext: (
      state,
      action: PayloadAction<{
        bookingId: string;
        bookingNumber: string;
        customerPhone: string;
        customerName: string;
        customerDob: string;
      }>
    ) => {
      state.bookingId = action.payload.bookingId;
      state.bookingNumber = action.payload.bookingNumber;
      state.customerPhone = action.payload.customerPhone;
      state.customerName = action.payload.customerName;
      state.customerDob = action.payload.customerDob;
    },

    clearBookingContext: (state) => {
      state.bookingId = null;
      state.bookingNumber = null;
      state.customerPhone = null;
      state.customerName = null;
      state.customerDob = null;
    },

    clearCart: (state) => {
      state.items = [];
      state.bookingId = null;
      state.bookingNumber = null;
      state.customerPhone = null;
      state.customerName = null;
      state.customerDob = null;
    },
  },
});

export const {
  addToCart,
  removeFromCart,
  updateQuantity,
  incrementQuantity,
  decrementQuantity,
  setBookingContext,
  clearBookingContext,
  clearCart,
} = foodCartSlice.actions;

export default foodCartSlice.reducer;

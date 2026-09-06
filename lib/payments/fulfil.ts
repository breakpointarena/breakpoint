import { supabaseAdmin } from '@/lib/supabase/server'
import type { DeviceBookingQuote, FoodOrderQuote, SubscriptionQuote } from './quote'
import { addMonthsToDateString, arenaToday } from '@/lib/utils/dates'
import { perExtraPlayerCharge } from './money'

/**
 * Turns a paid Razorpay order into a booking.
 *
 * Everything here is driven by the stored server quote, never by client input.
 * Money already changed hands by the time these run, so failures report whether a
 * refund is owed rather than silently dropping the payment.
 */

export interface PaymentReference {
  /** Empty for a fully-discounted booking where no payment was taken. */
  razorpayOrderId: string
  razorpayPaymentId: string
}

export type FulfilResult =
  | {
      success: true
      /** Set by the two booking flows; a subscription sets the pair below instead. */
      bookingId?: string
      bookingNumber?: string
      subscriptionId?: string
      planName?: string
    }
  | { success: false; error: string; refundRequired: boolean }

/** Dispatches a stored quote to the right fulfilment routine. */
export async function fulfilQuote(
  purpose: 'device_booking' | 'food_order' | 'subscription',
  quote: unknown,
  payment: PaymentReference
): Promise<FulfilResult> {
  if (purpose === 'device_booking') return fulfilDeviceBooking(quote as DeviceBookingQuote, payment)
  if (purpose === 'subscription') return fulfilSubscription(quote as SubscriptionQuote, payment)
  return fulfilFoodOrder(quote as FoodOrderQuote, payment)
}

/** Payment columns shared by both flows - online money lands in `online_amount`. */
function paidColumns(amount: number, payment: PaymentReference) {
  return {
    amount_paid: amount,
    cash_amount: 0,
    card_amount: 0,
    upi_amount: 0,
    online_amount: amount,
    status: 'confirmed',
    payment_status: 'paid',
    booking_source: 'online',
    locked_by: 'customer',
    razorpay_order_id: payment.razorpayOrderId || null,
    razorpay_payment_id: payment.razorpayPaymentId || null,
  }
}

async function getOrCreateCustomer(quote: {
  customer: { phone: string; name: string; email: string | null; dateOfBirth: string | null }
}): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('get_or_create_customer', {
    p_phone: quote.customer.phone,
    p_name: quote.customer.name,
    p_email: quote.customer.email,
    p_dob: quote.customer.dateOfBirth,
  })

  if (error) throw error
  return data as string
}

async function generateBookingNumber(): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('generate_booking_number')
  if (error) throw error
  return data as string
}

/**
 * Consumes one promo redemption.
 *
 * Deliberately non-fatal: the customer has already paid the discounted price, so
 * losing a race for the last redemption is not a reason to fail (or refund) a
 * completed booking. Exhaustion is caught earlier, at quote time; this logs the
 * rare overshoot for follow-up.
 */
async function claimPromoCode(promoCodeId: string | null) {
  if (!promoCodeId) return

  const { data: claimed, error } = await supabaseAdmin.rpc('claim_promo_code', {
    p_promo_code_id: promoCodeId,
  })

  if (error) {
    console.error('Promo code claim failed for', promoCodeId, error)
  } else if (claimed === false) {
    console.warn(
      `Promo code ${promoCodeId} was exhausted between pricing and payment; honouring the paid discount.`
    )
  }
}

async function decrementInventory(items: Array<{ id: string; quantity: number }>) {
  for (const item of items) {
    const { data: decremented, error } = await supabaseAdmin.rpc(
      'decrement_menu_item_quantity',
      {
        item_id: item.id,
        decrement_by: item.quantity,
      }
    )

    // Stock was validated at quote time; a failure here is an audit concern, not
    // a reason to fail an order the customer has already paid for. The RPC
    // reports insufficient stock by returning false rather than erroring, so both
    // outcomes have to be checked or an oversell passes silently.
    if (error) {
      console.error('Inventory decrement failed for item', item.id, error)
    } else if (decremented === false) {
      console.warn(
        `Insufficient stock for menu item ${item.id} (wanted ${item.quantity}) - ` +
          `sold between pricing and fulfilment. Order honoured; stock needs review.`
      )
    }
  }
}

// ================================================
// Device booking
// ================================================

/** The pricing and customer columns a paid booking carries, from the server quote. */
function bookedColumns(
  quote: DeviceBookingQuote,
  customerId: string,
  payment: PaymentReference
) {
  return {
    customer_id: customerId,
    customer_phone: quote.customer.phone,
    customer_name: quote.customer.name,
    customer_email: quote.customer.email,
    customer_dob: quote.customer.dateOfBirth,

    device_subtotal: quote.deviceSubtotal,
    food_subtotal: quote.addonsTotal,
    subscription_discount: quote.subscriptionDiscount,
    promo_discount: quote.promoDiscount,
    promo_code_id: quote.promoCodeId,
    happy_hour_discount: quote.happyHourDiscount,
    total_amount: quote.totalAmount,

    ...paidColumns(quote.totalAmount, payment),
  }
}

/**
 * Turns the customer's own hold into their paid booking.
 *
 * The station was claimed when they picked the slot, so there is nothing left to
 * compete for - this is a conversion, not a second assignment. The conditions on
 * the update are the whole safety argument: one statement, so the hold is either
 * still live and unspent at the instant it is claimed or the update matches
 * nothing. Nobody can convert a hold twice, convert a released one, or convert one
 * whose ten minutes ran out while Razorpay was open.
 *
 * Returns null when the hold did not survive, which is not fatal: the caller falls
 * back to claiming a station outright, so a lapsed hold only costs the customer
 * their reservation, not their booking.
 */
async function convertHeldBooking(
  quote: DeviceBookingQuote,
  customerId: string,
  payment: PaymentReference
): Promise<{ id: string; booking_number: string } | null> {
  if (!quote.holdBookingId || !quote.holdToken) return null

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      ...bookedColumns(quote, customerId, payment),
      hold_token: null,
      lock_expires_at: null,
      // The row was born when the slot was picked, but the booking exists from the
      // moment it is paid for. Staff notifications poll on created_at, and the
      // day's revenue is bucketed by it, so both would be wrong by up to the
      // length of the hold if this kept the reservation's timestamp.
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', quote.holdBookingId)
    .eq('status', 'locked')
    .eq('hold_token', quote.holdToken)
    .gt('lock_expires_at', new Date().toISOString())
    .select('id, booking_number')
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  // The slot row was written from device-type defaults when the hold was taken;
  // the quote is what the customer has now paid, so it wins.
  const { error: slotError } = await supabaseAdmin
    .from('booking_device_slots')
    .update({
      duration_hours: quote.durationHours,
      hourly_rate: quote.hourlyRate,
      slot_total: quote.deviceCharges,
      device_type: quote.deviceTypeName,
      player_count: quote.playerCount,
      included_players: quote.includedPlayers,
      extra_player_charge: quote.extraPlayerCharge,
      extra_players_total: quote.extraPlayersTotal,
    })
    .eq('booking_id', data.id)

  if (slotError) throw slotError

  return data
}

export async function fulfilDeviceBooking(
  quote: DeviceBookingQuote,
  payment: PaymentReference
): Promise<FulfilResult> {
  let bookingId: string | null = null

  try {
    const customerId = await getOrCreateCustomer(quote)

    // --- Preferred path: the reservation this customer already holds ---
    const converted = await convertHeldBooking(quote, customerId, payment)

    let booking: { id: string; booking_number: string }

    if (converted) {
      booking = converted
    } else {
      // No usable hold - it lapsed, was released, or this booking never had one
      // (a resumed payment, or a slot picked before holds existed). Claim a
      // station outright instead, which is still atomic and still refuses rather
      // than double-books.
      const bookingNumber = await generateBookingNumber()

      const { data: created, error: bookingError } = await supabaseAdmin
        .from('bookings')
        .insert({
          booking_number: bookingNumber,
          ...bookedColumns(quote, customerId, payment),
        })
        .select('id, booking_number')
        .single()

      if (bookingError) throw bookingError
      bookingId = created.id

      // --- Device slot ---
      // Station selection and slot insert happen in one locked transaction, so two
      // customers paying at the same moment cannot be given the same station.
      const { data: assignment, error: slotError } = await supabaseAdmin.rpc(
        'assign_device_slot',
        {
          p_booking_id: created.id,
          p_device_type_id: quote.deviceTypeId,
          p_slot_date: quote.selectedDate,
          p_slot_start_time: quote.slotStartTime24,
          p_slot_end_time: quote.slotEndTime24,
          p_duration_hours: quote.durationHours,
          p_hourly_rate: quote.hourlyRate,
          p_slot_total: quote.deviceCharges,
          p_device_type: quote.deviceTypeName,
          p_player_count: quote.playerCount,
          p_included_players: quote.includedPlayers,
          p_extra_player_charge: quote.extraPlayerCharge,
          p_extra_players_total: quote.extraPlayersTotal,
        }
      )

      if (slotError) throw slotError

      // Zero rows back means every station of this type is busy for the window.
      if (!assignment || (assignment as any[]).length === 0) {
        await supabaseAdmin.from('bookings').delete().eq('id', created.id)
        return {
          success: false,
          error:
            'That slot was taken while your payment was processing. Your payment is being refunded.',
          refundRequired: true,
        }
      }

      booking = created
    }

    bookingId = booking.id

    // --- Line items (billing breakdown shown to staff and customer) ---
    const lineItems: any[] = []
    let displayOrder = 1

    lineItems.push({
      booking_id: booking.id,
      item_type: 'device',
      description: `Device Booking (${quote.durationHours}h × ₹${quote.hourlyRate})`,
      quantity: quote.durationHours,
      unit_price: quote.hourlyRate,
      line_total: quote.deviceCharges,
      added_by: 'customer',
      is_paid: true,
      display_order: displayOrder++,
    })

    if (quote.extraPlayersCount > 0) {
      lineItems.push({
        booking_id: booking.id,
        item_type: 'extra_players',
        // Priced per player for the session, not per player-hour: that is the
        // number the customer was quoted, and the one this line multiplies by.
        description: `Extra Players (${quote.extraPlayersCount} × ₹${perExtraPlayerCharge(
          quote.extraPlayerCharge,
          quote.durationHours
        )})`,
        quantity: quote.extraPlayersCount,
        unit_price: perExtraPlayerCharge(quote.extraPlayerCharge, quote.durationHours),
        line_total: quote.extraPlayersTotal,
        added_by: 'customer',
        is_paid: true,
        display_order: displayOrder++,
      })
    }

    for (const addon of quote.addons) {
      lineItems.push({
        booking_id: booking.id,
        item_type: 'food',
        description: addon.name,
        quantity: addon.quantity,
        unit_price: addon.price,
        line_total: addon.lineTotal,
        reference_type: 'menu_item',
        reference_id: addon.id,
        added_by: 'customer',
        is_paid: true,
        display_order: displayOrder++,
      })
    }

    if (quote.subscriptionDiscount > 0) {
      lineItems.push({
        booking_id: booking.id,
        item_type: 'subscription_discount',
        description: 'Subscription Discount',
        quantity: 1,
        unit_price: -quote.subscriptionDiscount,
        line_total: -quote.subscriptionDiscount,
        added_by: 'customer',
        is_paid: true,
        display_order: displayOrder++,
      })
    }

    if (quote.promoDiscount > 0) {
      lineItems.push({
        booking_id: booking.id,
        item_type: 'promo_discount',
        description: quote.promoCode
          ? `Promo Code Discount (${quote.promoCode})`
          : 'Promo Code Discount',
        quantity: 1,
        unit_price: -quote.promoDiscount,
        line_total: -quote.promoDiscount,
        reference_type: 'promo_code',
        reference_id: quote.promoCodeId,
        added_by: 'customer',
        is_paid: true,
        display_order: displayOrder++,
      })
    }

    if (quote.happyHourDiscount > 0) {
      lineItems.push({
        booking_id: booking.id,
        item_type: 'happy_hour_discount',
        description: quote.happyHourRuleName
          ? `Happy Hour Discount (${quote.happyHourRuleName})`
          : 'Happy Hour Discount',
        quantity: 1,
        unit_price: -quote.happyHourDiscount,
        line_total: -quote.happyHourDiscount,
        reference_type: quote.happyHourRuleId ? 'happy_hour' : null,
        reference_id: quote.happyHourRuleId,
        added_by: 'customer',
        is_paid: true,
        display_order: displayOrder++,
      })
    }

    const { error: lineItemsError } = await supabaseAdmin
      .from('booking_line_items')
      .insert(lineItems)

    // The booking and its slot are valid without the breakdown; log and continue
    // rather than failing a paid booking over a display concern.
    if (lineItemsError) {
      console.error('Failed to insert booking line items:', lineItemsError)
    }

    // --- Addons mirrored into food items (kept in step with the walk-in flow) ---
    if (quote.addons.length > 0) {
      const { error: foodError } = await supabaseAdmin.from('booking_food_items').insert(
        quote.addons.map((addon) => ({
          booking_id: booking.id,
          menu_item_id: addon.id,
          quantity: addon.quantity,
          unit_price: addon.price,
          line_total: addon.lineTotal,
          item_name: addon.name,
          item_category: addon.category,
          status: 'preparing',
        }))
      )

      if (foodError) {
        console.error('Failed to insert booking food items:', foodError)
      } else {
        await decrementInventory(
          quote.addons.map((addon) => ({ id: addon.id, quantity: addon.quantity }))
        )
      }
    }

    await claimPromoCode(quote.promoCodeId)

    return { success: true, bookingId: booking.id, bookingNumber: booking.booking_number }
  } catch (err: any) {
    console.error('fulfilDeviceBooking error:', err)

    // A half-written booking is worse than none: clean up before reporting.
    if (bookingId) {
      await supabaseAdmin.from('booking_line_items').delete().eq('booking_id', bookingId)
      await supabaseAdmin.from('booking_device_slots').delete().eq('booking_id', bookingId)
      await supabaseAdmin.from('bookings').delete().eq('id', bookingId)
    }

    return {
      success: false,
      error: 'We could not complete your booking. Your payment is being refunded.',
      refundRequired: true,
    }
  }
}

// ================================================
// Standalone food order
// ================================================

export async function fulfilFoodOrder(
  quote: FoodOrderQuote,
  payment: PaymentReference
): Promise<FulfilResult> {
  let bookingId: string | null = null

  try {
    const customerId = await getOrCreateCustomer(quote)
    const bookingNumber = await generateBookingNumber()

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert({
        booking_number: bookingNumber,
        customer_id: customerId,
        customer_phone: quote.customer.phone,
        customer_name: quote.customer.name,
        customer_email: quote.customer.email,
        customer_dob: quote.customer.dateOfBirth,

        device_subtotal: 0,
        food_subtotal: quote.itemsTotal,
        // Food is never discounted - written explicitly so the row states the
        // rule rather than relying on column defaults.
        subscription_discount: 0,
        promo_discount: 0,
        happy_hour_discount: 0,
        total_amount: quote.totalAmount,

        ...paidColumns(quote.totalAmount, payment),
      })
      .select('id, booking_number')
      .single()

    if (bookingError) throw bookingError
    bookingId = booking.id

    // Paid up front, so the kitchen can start immediately.
    const { error: foodError } = await supabaseAdmin.from('booking_food_items').insert(
      quote.items.map((item) => ({
        booking_id: booking.id,
        menu_item_id: item.id,
        item_name: item.name,
        item_category: item.category,
        quantity: item.quantity,
        unit_price: item.price,
        line_total: item.lineTotal,
        status: 'preparing',
      }))
    )

    if (foodError) throw foodError

    const lineItems: any[] = []
    let displayOrder = 1

    for (const item of quote.items) {
      lineItems.push({
        booking_id: booking.id,
        item_type: 'food',
        description: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        line_total: item.lineTotal,
        reference_type: 'menu_item',
        reference_id: item.id,
        added_by: 'customer',
        is_paid: true,
        display_order: displayOrder++,
      })
    }

    // No discount line items: food carries no membership, promo or happy hour
    // reduction, so the breakdown is just the items themselves.

    const { error: lineItemsError } = await supabaseAdmin
      .from('booking_line_items')
      .insert(lineItems)

    if (lineItemsError) {
      console.error('Failed to insert booking line items:', lineItemsError)
    }

    await decrementInventory(
      quote.items.map((item) => ({ id: item.id, quantity: item.quantity }))
    )

    return { success: true, bookingId: booking.id, bookingNumber: booking.booking_number }
  } catch (err: any) {
    console.error('fulfilFoodOrder error:', err)

    if (bookingId) {
      await supabaseAdmin.from('booking_line_items').delete().eq('booking_id', bookingId)
      await supabaseAdmin.from('booking_food_items').delete().eq('booking_id', bookingId)
      await supabaseAdmin.from('bookings').delete().eq('id', bookingId)
    }

    return {
      success: false,
      error: 'We could not place your order. Your payment is being refunded.',
      refundRequired: true,
    }
  }
}

/**
 * Turns a paid order into a membership.
 *
 * Runs only after the Razorpay signature has been verified, which is the whole
 * point of it existing: the purchase page used to call `activateSubscriptionPlan`
 * itself with an invented payment id, so a membership appeared whether or not
 * anybody paid.
 *
 * `refundRequired` is true on every failure after this point. The money has
 * already moved by the time this runs, so a membership that cannot be created
 * owes the customer their money back rather than leaving them out of pocket.
 */
async function fulfilSubscription(
  quote: SubscriptionQuote,
  payment: PaymentReference
): Promise<FulfilResult> {
  try {
    const phone = quote.customer.phone

    // The customer row is upserted rather than assumed: somebody can buy a
    // membership as their first interaction with the arena, having never booked.
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    let customerId = existing?.id as string | undefined

    if (customerId) {
      await supabaseAdmin
        .from('customers')
        .update({
          name: quote.customer.name,
          email: quote.customer.email || null,
          date_of_birth: quote.customer.dateOfBirth || null,
        })
        .eq('id', customerId)
    } else {
      const { data: created, error: createError } = await supabaseAdmin
        .from('customers')
        .insert([
          {
            name: quote.customer.name,
            phone,
            email: quote.customer.email || null,
            date_of_birth: quote.customer.dateOfBirth || null,
          },
        ])
        .select('id')
        .single()

      if (createError || !created) {
        console.error('Could not create customer for subscription:', createError)
        return {
          success: false,
          error: 'We could not set up your membership. Your payment is being refunded.',
          refundRequired: true,
        }
      }
      customerId = created.id
    }

    // Arena clock, not the server's: a membership bought at half past midnight
    // must start on the day the customer is having, not the day UTC is having.
    const startDate = arenaToday()
    const endDate = addMonthsToDateString(startDate, quote.durationMonths || 1)

    const { data: subscription, error: insertError } = await supabaseAdmin
      .from('subscriptions')
      .insert([
        {
          customer_id: customerId,
          subscription_plan_id: quote.planId,
          start_date: startDate,
          end_date: endDate,
          payment_id: payment.razorpayPaymentId,
          amount_paid: quote.totalAmount,
          status: 'active',
        },
      ])
      .select('id')
      .single()

    if (insertError || !subscription) {
      console.error('Could not create subscription:', insertError)
      return {
        success: false,
        error: 'We could not activate your membership. Your payment is being refunded.',
        refundRequired: true,
      }
    }

    /**
     * The pointer is what every discount actually follows - see
     * `resolveActiveMembership`, which reads `active_subscription_id` rather than
     * looking for any active row. Moving it here is what makes the new membership
     * the one that counts, and what supersedes an older one still inside its term.
     *
     * A failure here leaves a paid membership the customer cannot use, so it is
     * reported rather than swallowed. No refund is asked for: the membership does
     * exist and an operator can repoint it, which is a better outcome than
     * reversing a payment for a plan that was genuinely bought.
     */
    const { error: pointerError } = await supabaseAdmin
      .from('customers')
      .update({ active_subscription_id: subscription.id })
      .eq('id', customerId)

    if (pointerError) {
      console.error(
        `Membership ${subscription.id} created but active_subscription_id not set for customer ${customerId}:`,
        pointerError
      )
    }

    return {
      success: true,
      subscriptionId: subscription.id,
      planName: quote.planName,
    }
  } catch (err: any) {
    console.error('fulfilSubscription error:', err)
    return {
      success: false,
      error: 'We could not activate your membership. Your payment is being refunded.',
      refundRequired: true,
    }
  }
}

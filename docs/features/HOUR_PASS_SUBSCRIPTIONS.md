# Personal hour-pack subscriptions

Hour packs are prepaid gaming time, separate from the existing percentage-discount memberships. Each new pack belongs to one device category and can only be redeemed on that category. Category pack prices are configured by staff; the application does not assume that different categories have the same hourly rate or pack price.

## Plans and expiry

Staff can create hour-pack plans from **Admin → Subscription**, selecting a device category as well as the number of hours, price, standard value, and validity term (1, 3, 6, or 12 months). A sold pack's category cannot be changed. Remaining time expires at the end of the purchased term; it cannot be carried forward. Existing uncategorized packs are retired from sale; paid balances remain usable on any category until spent or expired.

Customers buy a category-specific hour pack through the subscription checkout. The plan card and account page show which category it covers. A verified successful payment creates a separate balance for that purchase. Packs can be bought alongside a percentage-discount membership and do not replace that membership.

Staff can also assign any active membership or category-specific hour pack from **Admin → Customers** using the **Add subscription** button in the customer's Membership column. The assignment starts immediately, uses the plan's configured validity and hour balance, and records the full listed price as paid. It does not create a Razorpay transaction or transaction ID; use this for subscriptions paid for directly at the venue. Active hour packs can be removed from the customer row; removal cancels the subscription and clears its remaining balance while preserving the subscription and usage history.

## Using a pack for play

At check-in, enable shared play when individual players need separate time and charges. Add each player to the session, then link the enrolled player to their customer account from the booking details. A matching booking customer can be linked automatically; staff can also link a participant by account phone number. The pack must match the session's device category.

At checkout, the enrolled player's actual tracked minutes are deducted from their earliest-expiring valid pack(s). The pack covers only that player's share of the device charge. Other players' shares remain payable as usual, and food is never covered. If there is no active, unexpired balance, the regular booking charge applies. Minutes are still consumed when the player's eligible device charge is zero.

For example, if two players split a ₹3,800 device charge equally and one has a matching category pack, up to ₹1,900 of that player's share is covered; the companion still owes their own ₹1,900 share. A pack for another category is not used. If only one participant has a pack but the session has not been set up for individual shared-play tracking, staff should record the player separately before checkout rather than assigning the whole group charge to that account.

Apply the database migration before creating or redeeming category-specific packs. Redemption is atomic and recorded per player and per purchase so retries do not consume the same minutes twice.

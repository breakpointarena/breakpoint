I want to add multi-user participant support to an existing booking.

First inspect the repository and understand the current booking, checkout, pricing, food-order, Supabase schema, and admin booking flows. Follow the existing Next.js and Supabase conventions. Do not replace existing booking or payment logic.

Feature requirements:

1. Multiple users in one booking
- A booking must support multiple users/participants.
- The original user remains the booking owner.
- Admin/staff should be able to add another existing customer or user to the same booking.
- Store each participant's:
  - booking ID
  - user/customer ID
  - joined_at timestamp
  - left_at timestamp, if applicable
  - status
- Prevent duplicate users in the same booking.
- Preserve the existing behavior for bookings with only one user.

2. Time-based participant billing
- At checkout, calculate each participant's booking amount based on the time they joined, not by equally dividing the total.
- Use the existing booking pricing, duration, slot, discount, and tax logic wherever possible.
- A participant's billable period should begin at `joined_at` and end at the booking/session end time, or `left_at` if the existing system supports early departure.
- The original participant should be charged from the booking start time.
- Do not introduce a second conflicting pricing system. Extract or reuse the existing pricing calculation logic.
- Show a clear billing breakdown for every participant:
  - participant name
  - joined time
  - billable duration
  - booking amount
  - discounts/taxes if applicable
  - total
- Also show the complete booking total.
- Initially, the per-participant breakdown may be a calculation/display placeholder and does not need to immediately create separate payment transactions, but it must be calculated from real data and be easy for staff to explain to customers.
- Clearly label whether amounts are estimates, pending, or final according to the existing payment flow.
- Define and handle rounding consistently. The participant totals should reconcile with the booking total, or clearly show any rounding difference.

3. Food-order attribution
- Food items ordered during a booking must be assignable to the participant who ordered them.
- Add a participant/user reference to each food order or food-order item using the existing data model where appropriate.
- Admin/staff should be able to select or tag the participant when creating or editing a food order.
- Existing food orders must continue working when no participant is assigned.
- At checkout, show food charges grouped by participant:
  - participant name
  - ordered food items
  - quantity
  - item price
  - subtotal
- Show the overall food total and the combined booking plus food total.
- Make it clear when a food item is unassigned.

4. Admin experience
- Update the admin booking details/checkout UI so staff can:
  - view participants
  - add and remove participants
  - see join times
  - assign food orders to participants
  - view the participant billing breakdown
  - view booking total, food total, and grand total
- Add suitable loading, empty, validation, and error states.
- Do not disrupt the existing booking workflow.

5. Database and security
- Add the required Supabase migrations, indexes, constraints, and foreign keys.
- Follow existing RLS policies and authentication patterns.
- Ensure only authorized staff/admin users can add participants, edit join times, assign food, or view sensitive billing data.
- Use the repository's existing types and regenerate/update types if required.
- Consider how historical bookings and existing food orders migrate safely.

6. Testing
Add or update focused tests/scripts for:
- a single-user booking
- multiple participants joining at different times
- participants joining at the same time
- participant joining near the booking end
- rounding and total reconciliation
- duplicate participant prevention
- removing a participant
- assigned and unassigned food orders
- food totals grouped by participant
- unauthorized users attempting to modify participants or food attribution
- preserving existing checkout behavior

Implementation constraints:
- Keep the change focused and consistent with the existing architecture.
- Inspect nearby implementations before editing.
- Reuse existing booking, payment, pricing, customer, and food-order abstractions.
- Do not hard-code prices or duplicate business rules.
- Do not silently change existing payment behavior.
- If a business rule is ambiguous, document the assumption and choose the safest behavior.
- Before coding, provide a short implementation plan listing the files, schema changes, pricing approach, and tests.
- Then implement the feature, run the narrowest relevant tests/typechecks/lint, and summarize changed files and any remaining assumptions.
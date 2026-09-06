import type { Metadata } from 'next'
import { LegalPage, LegalSection, LegalList, ToBeConfirmed } from '@/components/customer/legal/LegalPage'
import { ARENA, BRAND_NAME } from '@/lib/legal/arena'

export const metadata: Metadata = {
  title: `Terms & Conditions - ${BRAND_NAME}`,
  description: `The terms on which you book, play and pay at ${BRAND_NAME}.`,
}

/**
 * Written for customers, in the register a high-street business uses: what is
 * booked, what it costs, when it can be cancelled, and how to behave on the
 * premises. Nothing here names how the booking system is built - a guest reading
 * this wants to know whether they can get their money back, not what runs behind
 * the counter.
 *
 * The blanks come from `lib/legal/arena.ts` and show as visible placeholders
 * until they are filled in. A plain-language draft, not legal advice.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      summary={`Please read these terms before booking. They explain how bookings work at ${BRAND_NAME}, what you pay, and what happens if plans change.`}
    >
      <LegalSection heading="1. About these terms">
        <p>
          These terms apply when you book a session, buy a membership, order food, or play at{' '}
          {BRAND_NAME}
          {ARENA.legalName ? `, operated by ${ARENA.legalName}` : ''}, located at{' '}
          {ARENA.address ?? <ToBeConfirmed what="Arena address" />}. By making a booking or entering
          the arena, you accept them.
        </p>
      </LegalSection>

      <LegalSection heading="2. Bookings">
        <LegalList
          items={[
            'When you choose a slot, we reserve it for a few minutes while you complete payment. If payment is not completed in that time, the slot is released for other guests.',
            'Your booking is confirmed once payment has been received or recorded by our staff. You will see a booking number, which is what to quote when you arrive.',
            'We reserve the type of gaming station you selected. The exact station is allotted to you when you arrive.',
            'Bookings are for the number of players stated. Please let us know in advance if more people are joining, as an additional charge applies per player.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Arrival and play time">
        <p>
          Please arrive a few minutes before your slot so we can seat you on time. Your session runs
          from the start time you booked, so arriving late will shorten it. We are not able to extend
          a session into a slot that another guest has booked.
        </p>
        <p>
          If you come without a booking, we will seat you if a station is free. Your time is counted
          from when we seat you until you finish, and you pay for the time you have actually played.
        </p>
      </LegalSection>

      <LegalSection heading="4. Prices and payment">
        <LegalList
          items={[
            'Gaming charges are billed by the hour at the rate displayed for that station, and include the number of players stated. Additional players are charged separately.',
            'You may pay online while booking, or by cash, card or UPI at the counter.',
            'If you pay only part of the amount up front, the balance is payable before you leave.',
            'Prices include applicable taxes unless we say otherwise.',
            'Online payments are handled securely by our payment partner. We do not receive or keep your card or bank details.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Memberships">
        <LegalList
          items={[
            'A membership gives you the stated discount on gaming charges for as long as it is valid. It does not apply to food and drink.',
            'Memberships are valid for the period shown at the time of purchase, are meant for your personal use, and cannot be transferred or shared.',
            'Your discount is applied automatically when you book using the mobile number registered to the membership.',
            'Membership fees are not refundable once the membership has started.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Offers and promotions">
        <p>
          Discount codes and special hourly rates apply to gaming charges only, not to food and
          drink, and only one discount code can be used per booking. Offers may be changed or
          withdrawn at any time, but a discount already applied to a booking you have paid for will
          always be honoured.
        </p>
      </LegalSection>

      <LegalSection heading="7. Food and drink">
        <p>
          You can order food and drink when booking or at any time during your session. Orders depend
          on what is available on the day. If something you have paid for turns out to be
          unavailable, we will offer you an alternative or refund that item.
        </p>
      </LegalSection>

      <LegalSection heading="8. Cancellations and refunds">
        <LegalList
          items={[
            <>
              To cancel or reschedule, please contact us before your session begins. Cancellations
              are accepted up to{' '}
              {ARENA.cancellationWindow ?? <ToBeConfirmed what="Cancellation window" />} before the
              booked start time.
            </>,
            'Once your session has started it cannot be cancelled. You are billed for the time played and anything you have ordered.',
            'If you do not turn up for a booked slot, the booking amount is not refundable.',
            'Refunds are made using the same method you paid with. Amounts paid at the counter are refunded at the counter.',
            'If we have to cancel your booking for any reason, you may choose another slot or a full refund.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="9. In the arena">
        <LegalList
          items={[
            'Please handle the equipment with care. You may be asked to pay for damage caused deliberately or by misuse.',
            'We may end a session without refund if a guest behaves in a way that is unsafe, abusive, or disruptive to others.',
            'Some games are meant for older players. We may ask for proof of age and may decline to seat a guest at a title that is not suitable for them.',
            'Outside food and drink are not permitted unless we have agreed to it in advance.',
            'Please keep your belongings with you. We cannot take responsibility for personal items lost or left behind.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="10. Our responsibility">
        <p>
          We take care to keep the arena safe and the equipment in good order. We are not responsible
          for interruptions outside our control, such as a power failure or an internet outage; where
          a session is cut short for such a reason, we will offer you the remaining time on another
          day or refund it.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to these terms">
        <p>
          We may update these terms from time to time. The version published on this page when you
          make a booking is the one that applies to it.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact us">
        <p>
          For any question about a booking, a refund, or these terms, write to{' '}
          {ARENA.email ?? <ToBeConfirmed what="Contact email" />}
          {ARENA.phone ? ` or call ${ARENA.phone}` : ''}.
        </p>
        {/*
          Named here as well as in the Privacy Policy: a customer with a
          complaint about a booking reads these terms, not that policy, and the
          IT Rules 2021 ask for the officer to be findable rather than filed
          under data protection.
        */}
        <p>
          If a complaint is not resolved to your satisfaction, you can escalate it
          to our Grievance Officer,{' '}
          {ARENA.grievanceOfficerName ?? <ToBeConfirmed what="Officer name" />}, at{' '}
          {ARENA.grievanceOfficerEmail ?? <ToBeConfirmed what="Officer email" />}.
        </p>
        <p>
          These terms are governed by Indian law, and the courts of{' '}
          {ARENA.jurisdiction ?? <ToBeConfirmed what="Jurisdiction" />} will have jurisdiction over
          any dispute.
        </p>
      </LegalSection>
    </LegalPage>
  )
}

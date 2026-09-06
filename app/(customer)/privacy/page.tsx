import type { Metadata } from 'next'
import { LegalPage, LegalSection, LegalList, ToBeConfirmed } from '@/components/customer/legal/LegalPage'
import { ARENA, BRAND_NAME } from '@/lib/legal/arena'

export const metadata: Metadata = {
  title: `Privacy Policy - ${BRAND_NAME}`,
  description: `How ${BRAND_NAME} collects, uses and protects your personal information.`,
}

/**
 * Written the way a customer-facing privacy policy reads: what we ask for, why,
 * who else sees it, and how to have it corrected or removed. No vendor names and
 * no description of how the site is built - a guest deciding whether to hand over
 * their number needs to know what happens to it, not which services carry it.
 *
 * A plain-language draft. Have it reviewed before you rely on it.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary={`${BRAND_NAME} respects your privacy. This page explains what personal information we collect, why we need it, and the choices you have.`}
    >
      <LegalSection heading="1. Information we collect">
        <LegalList
          items={[
            'Your name, mobile number, email address and date of birth, which you give us when you book or when we set up your details at the counter.',
            'Details of your bookings and orders - the station and time you booked, how many players, what you ordered, and when you arrived and left.',
            'Payment details such as the amount, how you paid, and a reference number for the transaction. We do not collect or store your card or bank details.',
            'Your membership details, if you hold one, and any discount codes you have used.',
            'A record that your mobile number has been verified.',
            'Basic information about how our website is used, which helps us keep it working properly and secure.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. How we use your information">
        <LegalList
          items={[
            'To reserve your slot, seat you when you arrive, and bill you correctly.',
            'To confirm that it is really you before showing your bookings or membership details.',
            'To apply your membership discount and any offer you are entitled to.',
            'To prepare and serve the food and drink you have ordered.',
            'To contact you about a booking - a change, a delay, or something you have left behind.',
            'To maintain the accounts and records we are required by law to keep.',
          ]}
        />
        <p>
          We do not sell your personal information to anyone, and we will only send you offers or
          updates if you have asked us to.
        </p>
      </LegalSection>

      <LegalSection heading="3. Verifying your mobile number">
        <p>
          Before showing you your own bookings or membership, we send a one-time code to your mobile
          number and ask you to enter it. This is to make sure nobody else can view your details. The
          code is valid only for a short time, and you may be asked to verify again later.
        </p>
      </LegalSection>

      <LegalSection heading="4. Payments">
        <p>
          Online payments are handled by a trusted payment partner on their own secure systems. Your
          card, UPI and bank details are entered there and are never shared with us. We are told only
          whether the payment succeeded, the amount, and a reference number, which is what allows us
          to match the payment to your booking and to process a refund if one is due.
        </p>
      </LegalSection>

      <LegalSection heading="5. When we share information">
        <p>We share your information only in these situations:</p>
        <LegalList
          items={[
            'With trusted partners who help us run the arena and this website - for example to take payments or to send the verification message to your mobile. They may use your information only for that purpose.',
            'Where we are required to do so by law, or by a government or regulatory authority.',
            'Where it is necessary to protect our rights, our staff, or the safety of our guests.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Cookies and similar technology">
        <p>
          Our website remembers a few things on your device - such as your mobile number and a
          booking you are part-way through - so that you do not have to enter them again. You can
          clear these at any time through your browser settings. We do not use cookies to track you
          across other websites or to show you advertisements.
        </p>
      </LegalSection>

      <LegalSection heading="7. How long we keep your information">
        <p>
          We keep booking, order and payment records for as long as our accounting and tax
          obligations require. Your customer details are kept while you remain a customer, so that we
          recognise you when you return and your membership continues to apply. Verification codes
          are discarded soon after they expire.
        </p>
      </LegalSection>

      <LegalSection heading="8. Keeping your information safe">
        <p>
          Access to customer details is limited to arena staff who need it for their work, and our
          staff systems are protected by individual logins. While no system can be completely secure,
          we take reasonable steps to protect your information and will inform you promptly if
          something goes wrong.
        </p>
      </LegalSection>

      <LegalSection heading="9. Your rights">
        <p>
          You may ask us for a copy of the information we hold about you, ask us to correct anything
          that is wrong, or ask us to delete your details - which we will do unless we are required
          to keep a record of a transaction. You may also withdraw your consent to us contacting you
          with offers at any time. Write to{' '}
          {ARENA.email ?? <ToBeConfirmed what="Contact email" />} and we will respond as quickly as we
          can.
        </p>
      </LegalSection>

      <LegalSection heading="10. Children">
        <p>
          Younger guests are welcome at the arena, but bookings should be made by a parent or
          guardian, whose details we keep rather than the child&apos;s. We ask for a date of birth
          because some games are meant only for older players.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to this policy">
        <p>
          We may update this policy from time to time. The version published on this page is the one
          that applies.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact us">
        <p>
          If you have any question about your personal information, please write to{' '}
          {ARENA.email ?? <ToBeConfirmed what="Contact email" />}
          {ARENA.phone ? `, call ${ARENA.phone}` : ''}
          {ARENA.address ? `, or visit us at ${ARENA.address}` : ''}.
        </p>
      </LegalSection>

      {/*
        Required by name, not just by inbox: Rule 3(2) of the IT Rules 2021 asks
        for a named Grievance Officer and their contact details to be published
        on the site. A general support address does not satisfy it, which is why
        this sits apart from "Contact us" above rather than inside it.
      */}
      <LegalSection heading="13. Grievance Officer">
        <p>
          If you are unhappy with how your personal information has been handled,
          you can raise it with our Grievance Officer,{' '}
          {ARENA.grievanceOfficerName ?? <ToBeConfirmed what="Officer name" />}, at{' '}
          {ARENA.grievanceOfficerEmail ?? <ToBeConfirmed what="Officer email" />}.
        </p>
        <p>
          We will acknowledge your complaint within 48 hours and aim to resolve it
          within 30 days. You may also complain to the Data Protection Board of
          India.
        </p>
      </LegalSection>
    </LegalPage>
  )
}

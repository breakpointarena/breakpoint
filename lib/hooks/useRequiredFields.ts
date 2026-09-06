"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps a submit button disabled until every required field in the form is
 * filled.
 *
 * The admin modals use uncontrolled inputs and read them back through FormData
 * on submit, so there is no state to check. Rather than convert every field to
 * controlled state, this leans on the browser's own validity: each mandatory
 * field already carries `required`, so `form.checkValidity()` is exactly the
 * question "is everything filled in?" - and it picks up `type="email"`, `min`
 * and `max` for free.
 *
 * Usage:
 *   const { formRef, isComplete, recheck } = useRequiredFields();
 *   <form ref={formRef} onChange={recheck} onSubmit={...}>
 *   <Button type="submit" disabled={!isComplete}>
 *
 * `recheck` is also returned for fields the browser cannot see - a custom
 * toggle or day picker that writes to a hidden input - so those can nudge it
 * after they change.
 */
export function useRequiredFields() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const recheck = useCallback(() => {
    setIsComplete(Boolean(formRef.current?.checkValidity()));
  }, []);

  // Run once on mount so an edit form, which opens already populated, starts
  // with its button enabled rather than waiting for the first keystroke.
  useEffect(() => {
    recheck();
  }, [recheck]);

  return { formRef, isComplete, recheck };
}

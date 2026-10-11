function createAttemptId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function storageKey(scope: string): string {
  return `studio-payment-attempt:${scope}`;
}

/** Reuses an uncertain payment request ID across retries and page reloads. */
export function getPaymentAttemptId(scope: string): string {
  const key = storageKey(scope);
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = createAttemptId();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    return createAttemptId();
  }
}

/** Rotates the request ID only after the payment result has been confirmed. */
export function completePaymentAttempt(scope: string): string {
  const key = storageKey(scope);
  const next = createAttemptId();
  try {
    window.sessionStorage.setItem(key, next);
  } catch {
    // The in-memory ID still protects retries until this view is closed.
  }
  return next;
}

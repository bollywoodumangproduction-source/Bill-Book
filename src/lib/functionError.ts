type FunctionError = {
  message?: string;
  context?: unknown;
} | null;

/** Extract a useful message from Supabase Edge Function errors, including non-2xx JSON responses. */
export async function getFunctionErrorMessage(
  error: FunctionError,
  data: { error?: string } | null,
  fallback: string,
): Promise<string> {
  if (data?.error) return data.error;

  const context = error?.context;
  if (context instanceof Response) {
    try {
      const body: unknown = await context.clone().json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        return body.error;
      }
    } catch {
      // Keep the status/message fallback when the response has no JSON body.
    }
    if (context.status) return `${fallback} (HTTP ${context.status})`;
  }

  return error?.message ? `${fallback}: ${error.message}` : fallback;
}

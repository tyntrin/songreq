/**
 * Customer send: keep the clientRequestId after a network error or a 5xx (the server may or may not
 * have stored the request), so a retry is idempotent. Reset it after success or any 4xx answer.
 */
export function keepAttemptAfter(status: number | "network"): boolean {
  return status === "network" || status >= 500;
}

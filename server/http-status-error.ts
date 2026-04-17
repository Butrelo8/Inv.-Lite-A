/** Error carrying HTTP status for transaction-style flows (assign/return). */
export function httpStatusError(status: number, message: string): Error {
  const e = new Error(message);
  (e as Error & { status: number }).status = status;
  return e;
}

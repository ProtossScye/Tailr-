/** Thrown whenever input to the accounting engine is invalid. */
export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountingError";
  }
}

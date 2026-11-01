export interface ValidationIssue {
  /** The input field the problem belongs to, so a form can show it next to the field. */
  field: string;
  message: string;
}

/** The input was rejected. Nothing was written. */
export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join("; "));
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/**
 * The bet does not exist, or it belongs to someone else. The two look identical on
 * purpose, so nobody can probe which bet ids exist.
 */
export class NotFoundError extends Error {
  constructor(message = "Bet not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The database call failed (network, permissions, a constraint). `code` is the Postgres/PostgREST code when known. */
export class RepositoryError extends Error {
  readonly operation: string;
  readonly code: string | undefined;

  constructor(operation: string, cause: unknown) {
    const message =
      typeof cause === "object" && cause !== null && "message" in cause
        ? String((cause as { message: unknown }).message)
        : String(cause);
    super(`${operation} failed: ${message}`);
    this.name = "RepositoryError";
    this.operation = operation;
    this.code =
      typeof cause === "object" && cause !== null && "code" in cause
        ? String((cause as { code: unknown }).code)
        : undefined;
  }
}

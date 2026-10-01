export class HttpError extends Error {
  status: number;
  code?: string;
  // Extra machine-readable facts sent alongside the message (see
  // middleware/errorHandler.ts), e.g. which device holds the admin console.
  details?: Record<string, unknown>;

  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, code?: string) {
    super(400, message, code);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string, code?: string) {
    super(403, message, code);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string, code?: string) {
    super(401, message, code);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, code?: string) {
    super(404, message, code);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(409, message, code, details);
  }
}

export class ForbiddenError extends Error {
  public readonly statusCode = 403;

  constructor(message = "Acesso negado") {
    super(message);
    this.name = "ForbiddenError";
  }
}

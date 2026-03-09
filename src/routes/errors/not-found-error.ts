export class NotFoundError extends Error {
  public readonly statusCode = 404;

  constructor(message = "Recurso não encontrado") {
    super(message);
    this.name = "NotFoundError";
  }
}

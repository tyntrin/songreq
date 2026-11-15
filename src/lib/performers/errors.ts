export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class InviteError extends Error {
  constructor(message = "Invite invalid or expired") {
    super(message);
    this.name = "InviteError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
export class ClosedError extends Error {
  constructor(message = "Not accepting requests") {
    super(message);
    this.name = "ClosedError";
  }
}
export class BlockedError extends Error {
  constructor(message = "Device blocked") {
    super(message);
    this.name = "BlockedError";
  }
}
export class RateLimitError extends Error {
  constructor(message = "Rate limited") {
    super(message);
    this.name = "RateLimitError";
  }
}
export class UnavailableSongsError extends Error {
  unavailableSongIds: string[];
  constructor(unavailableSongIds: string[]) {
    super("Some songs are not available");
    this.name = "UnavailableSongsError";
    this.unavailableSongIds = unavailableSongIds;
  }
}

export type ApiErrorKind = "offline" | "server" | "auth" | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

function isOfflineMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("econnrefused") ||
    lower.includes("cannot reach the api") ||
    lower.includes("aborted") ||
    lower.includes("timeout")
  );
}

export function classifyFetchError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof DOMException && err.name === "AbortError") {
    return new ApiError(
      "Request timed out. The backend may be offline or overloaded.",
      "offline",
    );
  }

  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    if (msg.includes("fetch") || msg.includes("network") || isOfflineMessage(msg)) {
      return new ApiError(
        "Cannot reach the API. Check that the backend is running.",
        "offline",
      );
    }
  }

  if (err instanceof Error) {
    if (err.message.includes("401") || err.message.toLowerCase().includes("authentication")) {
      return new ApiError("Sign in required to access this resource.", "auth", 401);
    }
    if (err.message.includes("503")) {
      return new ApiError(
        "Service temporarily unavailable. Check API configuration (e.g. CEREBRAS_API_KEY).",
        "server",
        503,
      );
    }
    if (isOfflineMessage(err.message)) {
      return new ApiError(
        "Cannot reach the API. Check that the backend is running.",
        "offline",
      );
    }
    return new ApiError(err.message, "unknown");
  }

  return new ApiError("An unexpected error occurred.", "unknown");
}

export function friendlyErrorTitle(kind: ApiErrorKind): string {
  switch (kind) {
    case "offline":
      return "Connecting to Sovereign";
    case "server":
      return "Service unavailable";
    case "auth":
      return "Authentication required";
    default:
      return "Something went wrong";
  }
}

export function friendlyErrorDescription(err: ApiError): string {
  switch (err.kind) {
    case "offline":
      return "We're setting things up — live market data and analysis will be available shortly. We'll retry automatically.";
    case "server":
      return err.message;
    case "auth":
      return "Sign in to save portfolio holdings, alert rules, and library documents.";
    default:
      return err.message;
  }
}

export function friendlyOfflineToast(): string {
  return "Connecting to Sovereign — retrying automatically…";
}

import { toast } from "sonner";

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

const GENERIC_SERVER_MESSAGES = new Set(
  [
    "internal server error",
    "internal server error.",
    "error",
    "unknown error",
    "something went wrong",
  ].map((s) => s.toLowerCase()),
);

/** Map generic API failure strings to user-friendly copy. */
export function sanitizeServerMessage(msg: string): string {
  const trimmed = msg.trim();
  if (!trimmed) {
    return "Analysis service unavailable. Try again in a moment.";
  }
  const lower = trimmed.toLowerCase();
  if (GENERIC_SERVER_MESSAGES.has(lower)) {
    return "Analysis service unavailable. Try again in a moment.";
  }
  if (/^request failed \(\d{3}\)$/.test(lower)) {
    return "Analysis service unavailable. Try again in a moment.";
  }
  return trimmed;
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
      return sanitizeServerMessage(err.message);
    case "auth":
      return "Sign in to save portfolio holdings, alert rules, and library documents.";
    default:
      return sanitizeServerMessage(err.message);
  }
}

export function friendlyOfflineToast(): string {
  return "Connecting to Sovereign — retrying automatically…";
}

export function toastApiError(
  err: unknown,
  options?: { onRetry?: () => void; message?: string },
): void {
  const apiError = err instanceof ApiError ? err : classifyFetchError(err);
  let description: string;
  if (options?.message) {
    description = options.message;
  } else if (apiError.kind === "offline") {
    description = friendlyOfflineToast();
  } else if (apiError.kind === "auth") {
    description = authRequiredMessage();
  } else {
    description = friendlyErrorDescription(apiError);
  }

  toast.error(description, {
    ...(options?.onRetry
      ? { action: { label: "Retry", onClick: options.onRetry } }
      : {}),
  });
}

/** Parse FastAPI `{ detail: string | object[] }` from error response bodies. */
export function parseFastApiDetail(text: string): string {
  if (!text.trim()) return text;
  try {
    const json = JSON.parse(text) as { detail?: unknown };
    const { detail } = json;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return JSON.stringify(item);
        })
        .join("; ");
    }
    if (detail && typeof detail === "object") {
      return JSON.stringify(detail);
    }
  } catch {
    /* not JSON — use raw text */
  }
  return text;
}

export function apiErrorFromResponse(text: string, status: number): ApiError {
  const message = parseFastApiDetail(text) || `Request failed (${status})`;
  const kind: ApiErrorKind =
    status === 401 ? "auth" : status >= 500 ? "server" : "unknown";
  return new ApiError(message, kind, status);
}

export const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function authRequiredMessage(): string {
  return CLERK_ENABLED
    ? "Sign in required. Go to /sign-in to continue."
    : "Authentication required.";
}

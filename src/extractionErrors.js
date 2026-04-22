/**
 * Shared helpers for university/city extraction: timeouts and retry hints for API clients.
 */

/** Max wait for a single Gemini generateContent call (10 minutes). */
const GEMINI_GENERATE_TIMEOUT_MS = 600_000;

class ExtractionTimeoutError extends Error {
  constructor(ms = GEMINI_GENERATE_TIMEOUT_MS) {
    super(`Gemini request timed out after ${Math.round(ms / 1000)} seconds`);
    this.name = "ExtractionTimeoutError";
    this.code = "EXTRACTION_TIMEOUT";
    this.retryable = true;
    this.timeoutMs = ms;
  }
}

/**
 * Race a promise against a timeout. Timer is cleared when the promise settles.
 */
function withTimeout(promise, ms, TimeoutClass = ExtractionTimeoutError) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutClass(ms)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Whether callers should retry (transient Gemini/network/quota issues).
 */
function isRetryableExtractionError(err) {
  if (!err) return false;
  if (err.retryable === true) return true;
  if (err.retryable === false) return false;
  if (err.code === "EXTRACTION_TIMEOUT") return true;

  const msg = String(err.message || "").toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("504") ||
    msg.includes("resource exhausted") ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("try again") ||
    msg.includes("try again later") ||
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("internal error") ||
    msg.includes("overloaded") ||
    msg.includes("rate limit")
  );
}

module.exports = {
  GEMINI_GENERATE_TIMEOUT_MS,
  ExtractionTimeoutError,
  withTimeout,
  isRetryableExtractionError,
};

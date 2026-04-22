/**
 * Retries Gemini generateContent on transient transport / 5xx errors.
 * Uses timeout per attempt from extractionErrors.withTimeout.
 */

const {
  GEMINI_GENERATE_TIMEOUT_MS,
  ExtractionTimeoutError,
  withTimeout,
} = require("./extractionErrors");

const DEFAULT_MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1500;
const JITTER_MAX_MS = 500;
const DELAY_AFTER_500_MS = 3000;

function getHttpStatusFromGeminiError(err) {
  if (err == null) return null;
  let e = err;
  for (let i = 0; i < 6 && e; i++) {
    if (typeof e.status === "number") return e.status;
    e = e.cause;
  }
  const msg = String(err.message || "");
  const bracket = msg.match(/\[(\d{3})\s/);
  if (bracket) return parseInt(bracket[1], 10);
  return null;
}

function isFetchFailedError(err) {
  return String(err?.message || "").includes("fetch failed");
}

function logFetchFailedCause(err) {
  if (!isFetchFailedError(err)) return;
  const c = err.cause;
  const n = c && c.cause;
  console.warn("   ⚠️  Gemini fetch failed — cause detail:", {
    causeName: c?.name,
    causeMessage: c?.message,
    causeCode: c?.code,
    errno: c?.errno,
    syscall: c?.syscall,
    nestedName: n?.name,
    nestedMessage: n?.message,
    nestedCode: n?.code,
  });
}

function isRetryableGeminiTransportError(err) {
  if (err instanceof ExtractionTimeoutError) return true;
  const status = getHttpStatusFromGeminiError(err);
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  if (isFetchFailedError(err)) return true;
  const msg = String(err?.message || "").toLowerCase();
  if (msg.includes("resource exhausted")) return true;
  if (msg.includes("unavailable") && msg.includes("503")) return true;
  if (msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("socket")) {
    return true;
  }
  return false;
}

/**
 * @param {*} model - GenerativeModel from @google/generative-ai
 * @param {string|*} prompt - argument to model.generateContent
 * @param {{ maxAttempts?: number }} [options]
 */
async function geminiGenerateContentWithRetry(model, prompt, options = {}) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastErr;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const call = model.generateContent(prompt);
      return await withTimeout(call, GEMINI_GENERATE_TIMEOUT_MS);
    } catch (err) {
      lastErr = err;
      logFetchFailedCause(err);

      const retryable = isRetryableGeminiTransportError(err);
      if (!retryable || attempt === maxAttempts - 1) {
        throw err;
      }

      const status = getHttpStatusFromGeminiError(err);
      const after500 = status === 500 || status === 502 || status === 503 || status === 504;
      let delay = after500 ? DELAY_AFTER_500_MS : BASE_DELAY_MS * (attempt + 1);
      delay += Math.floor(Math.random() * JITTER_MAX_MS);

      console.warn(
        `   ⏳ Gemini generateContent: transport retry ${attempt + 1}/${maxAttempts - 1} in ${delay}ms (http=${status ?? "n/a"})`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

module.exports = {
  geminiGenerateContentWithRetry,
  getHttpStatusFromGeminiError,
  isRetryableGeminiTransportError,
};

import { runWithRequestTimeout } from './request-timeout.js';

const FEEDBACK_ENDPOINT = 'https://script.google.com/macros/s/AKfycbz7MxHqTniRl88_VFM7FOdbOwD0jt7AfSZ4v3fMB6sJLIeNseFdFJFoWQnA3RysLFiY_w/exec';

/**
 * Send a feedback payload using the deployed Apps Script's no-CORS contract.
 * A resolved request means the browser sent it; the opaque response cannot
 * confirm whether the service accepted or stored it.
 */
export function sendFeedbackRequest(payload, { fetchImpl = fetch, signal, timeoutMs } = {}) {
    return runWithRequestTimeout(requestSignal => fetchImpl(FEEDBACK_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: requestSignal
    }), { signal, timeoutMs });
}

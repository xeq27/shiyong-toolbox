/** Keep local note IDs compatible with UUIDs on public HTTP origins as well as HTTPS. */
export function createNoteId(cryptoApi = globalThis.crypto) {
    if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The Clipboard API requires HTTPS; a selected temporary textarea supports ordinary HTTP. */
export async function copyText(content) {
    if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(content); return; }
        catch { /* Fall back when browser clipboard permission is denied. */ }
    }
    const previousFocus = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.readOnly = true;
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(textarea);
    try {
        textarea.select();
        if (!document.execCommand('copy')) throw new Error('自动复制不可用，请选中文本后手动复制。');
    } finally {
        textarea.remove();
        previousFocus?.focus({ preventScroll: true });
    }
}

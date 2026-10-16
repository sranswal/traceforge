/**
 * Pure Markdown & HTML Entity Normalization Utilities
 * Safe single-pass entity decoding preserving literal code and preventing double-decoding.
 */

export function safeDecodeHtmlEntities(str) {
  if (typeof str !== 'string' || !str.includes('&')) return str;
  return str.replace(/&(?:#x([0-9a-fA-F]+)|#([0-9]+)|([a-zA-Z]+));/g, (match, hex, dec, named) => {
    if (hex) {
      const code = parseInt(hex, 16);
      return !isNaN(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    if (dec) {
      const code = parseInt(dec, 10);
      return !isNaN(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    const NAMED_MAP = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' '
    };
    return Object.prototype.hasOwnProperty.call(NAMED_MAP, named) ? NAMED_MAP[named] : match;
  });
}

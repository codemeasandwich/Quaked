/** Physical authoring layout. Logical pack identities remain stable across moves.
 * assets/layout.json is shared by source play, packaging and authoring tools.
 */
import layout from '../../assets/layout.json' with { type: 'json' };

export function ResourcePath(path) {
  if (layout.files[path]) return layout.files[path];
  for (const [from, to] of Object.entries(layout.prefixes).sort((a,b)=>b[0].length-a[0].length)) {
    if (path === from.slice(0, -1)) return to.slice(0, -1);
    if (path.startsWith(from)) return to + path.slice(from.length);
  }
  return path;
}
export function ResourceLogicalPath(path) {
  for (const [from, to] of Object.entries(layout.files)) if (path === to) return from;
  for (const [from, to] of Object.entries(layout.prefixes).sort((a,b)=>b[1].length-a[1].length)) {
    if (path === to.slice(0, -1)) return from.slice(0, -1);
    if (path.startsWith(to)) return from + path.slice(to.length);
  }
  return path;
}
/** Retain query/hash and origin on source-relative URLs; leave code and external URLs alone. */
export function ResourceURL(path, logical = false) {
  const map = logical ? ResourceLogicalPath : ResourcePath;
  const value = String(path);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const url = new URL(value);
    if (globalThis.location?.origin && url.origin !== globalThis.location.origin && url.hostname !== 'quaked.invalid') return value;
    const pageBase = globalThis.document?.baseURI ?? globalThis.location?.href;
    const root = url.hostname === 'quaked.invalid' || !pageBase ? '/' : new URL('.', pageBase).pathname;
    if (!url.pathname.startsWith(root)) return value;
    const relative = url.pathname.slice(root.length), mapped = map(relative);
    if (mapped !== relative) url.pathname = root + mapped;
    return url.href;
  }
  const match = /^([^?#]*)(.*)$/.exec(value), leading = match[1].startsWith('/') ? '/' : '';
  return leading + map(match[1].slice(leading.length)) + match[2];
}

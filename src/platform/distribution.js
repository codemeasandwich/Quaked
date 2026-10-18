/** Packaged assets use the existing engine loaders. A source checkout keeps ordinary URLs.
 * The HTML bootstrap installs a lazy URL resolver before importing the engine. No global
 * fetch interception or native filesystem authority is exposed to web builds.
 */
import { ResourceURL } from './resource_paths.js';
export const Distribution_Profile = () => globalThis.__QUAKED_DISTRIBUTION__?.profile ?? 'source';
export function AssetURL(path) {
  return globalThis.__QUAKED_DISTRIBUTION__?.url(ResourceURL(path, true)) ?? ResourceURL(path);
}
export function AssetFetch(path, options) {
  const distribution = globalThis.__QUAKED_DISTRIBUTION__;
  if (distribution && !distribution.has(ResourceURL(path, true))) return Promise.resolve(new Response(null, {status:404}));
  return fetch(AssetURL(path), options);
}
/** Whether this copy has the asset at `path`: always in a source checkout; in a package, false for
 * an asset of a game pack it does not have (docs/per-game-packs-design-2026-10-13.md). */
export function AssetAvailable(path) {
  return globalThis.__QUAKED_DISTRIBUTION__?.has(ResourceURL(path, true)) ?? true;
}

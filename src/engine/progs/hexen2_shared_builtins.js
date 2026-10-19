/**
 * @module engine/progs/hexen2_shared_builtins
 *
 * A one-slot seam between the Hexen layers and Quake's builtin table. Package U0 merges the two into one table; until
 * that lands, `server/pr_cmds.js` publishes its table here and `Hexen2_CallBuiltin` uses it for every number a Hexen
 * layer deliberately does not override. This module imports nothing, so it cannot create the pr_cmds/pr_exec cycle
 * that a direct import would.
 *
 * Types: plain values and functions; no exported classes.
 * State: the published resolver (module-level, replaced by `PR_InitBuiltins`' owner).
 * Errors: none raised.
 */

let resolver = null;

/**
 * Publishes the shared builtin resolver.
 *
 * @param {?function(number): ?function(): void} fn the resolver, or null
 */
export function Hexen2_SetSharedBuiltinResolver( fn ) { resolver = typeof fn === 'function' ? fn : null; }

/**
 * Resolves a shared builtin.
 *
 * @param {number} number the builtin number
 * @returns {?function(): void} the implementation, or null when no shared table has been published
 */
export function Hexen2_SharedBuiltin( number ) { return resolver === null ? null : resolver( number ); }

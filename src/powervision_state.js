import { IT_INVISIBILITY, IT_INVULNERABILITY, STAT_HEALTH } from './quakedef.js';

// Native item bits carry server expiry, renewal and save restoration. Never
// synthesize a second timer from item_gettime. Ring wins over Pentagram, as in
// Quake's native visual priority; Demon resumes if its own bit remains set.
export function PowerVisionMode(client, enhanced) {
	if (!enhanced || !client || client.stats[STAT_HEALTH] <= 0 || client.intermission) return 0;
	return client.items & IT_INVISIBILITY ? 1 : client.items & IT_INVULNERABILITY ? 2 : 0;
}

// Pure temporal admission, shared by runtime and lifecycle regression tests.
export function PowerVisionHistory(previous, frame) {
	if (!previous || frame.mode !== 1 || previous.mode !== frame.mode ||
		previous.world !== frame.world || previous.view !== frame.view ||
		previous.width !== frame.width || previous.height !== frame.height ||
		(previous.projection && frame.projection && frame.projection.some((v,i)=>v!==previous.projection[i])) ||
		frame.time < previous.time || frame.time - previous.time > .25 ||
		frame.origin.some((v, i) => Math.abs(v - previous.origin[i]) > 64) ||
		frame.forward.reduce((sum, v, i) => sum + v * previous.forward[i], 0) < .8)
		return false;
	return true;
}

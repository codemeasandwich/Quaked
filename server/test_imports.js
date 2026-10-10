import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
// Test that Deno can import the existing JS modules from src/
// Run with: deno run --allow-read --allow-net --config ../deno.json test_imports.js ("three" is the browser's own module)

console.log('Testing imports from ../src/...');

// Test basic modules
try {
	const { Sys_Printf, Sys_FloatTime } = await import('../src/engine/common/sys.js');
	console.log('✓ sys.js imported');
	Sys_Printf('  Test printf: %s', 'works!');
} catch (e) {
	console.error('✗ sys.js failed:', e.message);
}

try {
	const mathlib = await import('../src/engine/common/mathlib.js');
	console.log('✓ mathlib.js imported');
} catch (e) {
	console.error('✗ mathlib.js failed:', e.message);
}

try {
	const quakedef = await import('../src/engine/common/quakedef.js');
	console.log('✓ quakedef.js imported');
} catch (e) {
	console.error('✗ quakedef.js failed:', e.message);
}

try {
	const protocol = await import('../src/engine/common/protocol.js');
	console.log('✓ protocol.js imported');
} catch (e) {
	console.error('✗ protocol.js failed:', e.message);
}

try {
	const common = await import('../src/engine/common/common.js');
	console.log('✓ common.js imported');
} catch (e) {
	console.error('✗ common.js failed:', e.message);
}

try {
	const server = await import('../src/engine/server/server.js');
	console.log('✓ server.js imported');
} catch (e) {
	console.error('✗ server.js failed:', e.message);
}

// Test server modules
try {
	const sv_main = await import('../src/engine/server/sv_main.js');
	console.log('✓ sv_main.js imported');
} catch (e) {
	console.error('✗ sv_main.js failed:', e.message);
}

try {
	const sv_phys = await import('../src/engine/server/sv_phys.js');
	console.log('✓ sv_phys.js imported');
} catch (e) {
	console.error('✗ sv_phys.js failed:', e.message);
}

try {
	const world = await import('../src/engine/server/world.js');
	console.log('✓ world.js imported');
} catch (e) {
	console.error('✗ world.js failed:', e.message);
}

// Test QuakeC modules
try {
	const pr_exec = await import('../src/engine/progs/pr_exec.js');
	console.log('✓ pr_exec.js imported');
} catch (e) {
	console.error('✗ pr_exec.js failed:', e.message);
}

try {
	const pr_edict = await import('../src/engine/progs/pr_edict.js');
	console.log('✓ pr_edict.js imported');
} catch (e) {
	console.error('✗ pr_edict.js failed:', e.message);
}

// Test model loading (uses THREE)
try {
	const gl_model = await import('../src/engine/render/gl_model.js');
	console.log('✓ gl_model.js imported');
} catch (e) {
	console.error('✗ gl_model.js failed:', e.message);
}

console.log('\nImport test complete!');

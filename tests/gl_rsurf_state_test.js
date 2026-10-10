// The world renderer's shared state on its own (card [44i]): the world's group is made once, named, and the same
// object every call. Through the public interface of gl_rsurf_state.js.
import { worldState, R_EnsureWorldGroup } from '../src/engine/render/gl_rsurf_state.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'R_EnsureWorldGroup makes the quake_world group once and keeps it in worldState', () => {
	const group = R_EnsureWorldGroup();
	check( group && group.isGroup && group.name === 'quake_world', 'a THREE.Group named quake_world' );
	check( worldState.group === group, 'kept as worldState.group' );
	check( R_EnsureWorldGroup() === group, 'the same group on the next call' );
	const before = worldState.renderGroup;
	R_EnsureWorldGroup();
	check( worldState.renderGroup === before, 'the render group is left to the frame to set' );
} );

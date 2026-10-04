// Three's compileAsync polls currentProgram on the original Material objects.
// Collection/map changes can detach their meshes immediately, but destroying a
// polled material removes those properties and strands the compile promise.
// A lease delays only GPU material disposal, not scene or gameplay lifetime.
const leases = new WeakMap();

export function R_CompileSceneAsync( renderer, scene, camera ) {
 if ( typeof renderer.compileAsync !== 'function' ) return renderer.compile( scene, camera );
 const materials = new Set();
 scene.traverse( object => {
  for ( const material of Array.isArray( object.material ) ? object.material : object.material ? [ object.material ] : [] ) materials.add( material );
 } );
 if ( scene.overrideMaterial ) materials.add( scene.overrideMaterial );
 const held = [];
 function release() {
  let failure;
  for ( const [ material, lease ] of held.splice( 0 ) ) {
   if ( --lease.count !== 0 ) continue;
   leases.delete( material );
   try {
    if ( material.dispose === lease.wrapper ) {
     if ( lease.descriptor ) Object.defineProperty( material, 'dispose', lease.descriptor );
     else delete material.dispose;
    }
    if ( lease.pending ) lease.original.call( material );
   } catch ( error ) { failure ||= error; }
  }
  if ( failure ) throw failure;
 }
 try {
  for ( const material of materials ) {
   let lease = leases.get( material );
   if ( !lease ) {
    lease = { count: 0, pending: false, original: material.dispose, descriptor: Object.getOwnPropertyDescriptor( material, 'dispose' ) };
    lease.wrapper = () => { lease.pending = true; };
    Object.defineProperty( material, 'dispose', { configurable: true, writable: true, value: lease.wrapper } );
    leases.set( material, lease );
   }
   lease.count ++; held.push( [ material, lease ] );
  }
  return Promise.resolve( renderer.compileAsync( scene, camera ) ).finally( release );
 } catch ( error ) { release(); throw error; }
}

/** Production IPC channel adapter for the existing Window driver.
 * The injected native command API keeps lifecycle/order behavior independently testable. */
export function createLanChannel(state,id,{invoke,endSession}){
 const ch={onmessage:null,close:()=>endSession(state),postMessage(message){
  if(state.closed)return;
  const copy={...message,b:message.b?Array.from(message.b):undefined};
  if(state.out.length>=256){fail(Error('LAN send queue overflow'));return;}
  const last=state.out.at(-1);
  if(copy.k==='msg'&&copy.r===0&&last?.k==='msg'&&last.r===0&&last.to===copy.to)state.out.pop();
  state.out.push(copy);send();
 }};
 const deliver=message=>{if(state.closed)return;if(message.b)message.b=Uint8Array.from(message.b);ch.onmessage?.({data:message});};
 const fail=error=>{
  if(state.closed)return;
  console.error('LAN:',error);state.error=String(error);
  if(id!=='host'){deliver({k:'refuse',from:'host',to:id,reason:String(error)});deliver({k:'close',from:'host',to:id});}
  else for(const peer of state.peers)deliver({k:'close',from:peer,to:'host'});
  endSession(state);
 };
 const send=async()=>{
  if(state.sending)return;state.sending=true;
  try{await state.ready;while(state.out.length&&!state.closed){
   const message=state.out.shift();
   try{await invoke('lan_send',{message});}
   catch(error){
    if(state.closed)return;
    if(id!=='host')throw error;
    // One departing player cannot terminate the host or the other players.
    state.out=state.out.filter(p=>p.to!==message.to);state.peers.delete(message.to);
    deliver({k:'close',from:message.to,to:'host'});
   }
  }}
  catch(error){fail(error);}finally{state.sending=false;}
 };
 const poll=async()=>{
  try{await state.ready;if(state.closed)return;for(const message of await invoke('lan_poll')){if(state.closed)return;if(message.from!=='host')state.peers.add(message.from);deliver(message);}}
  catch(error){fail(error);}
  if(!state.closed)state.timer=setTimeout(poll,10);
 };
 if(id!=='host')state.ready=invoke('lan_join',{address:state.address,fingerprint:state.fingerprint,peer:id});
 poll();return ch;
}

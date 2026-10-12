/** Native LAN uses the existing Window driver, including its Quake handshake,
 * message queues, local server, gameplay and packet parser. Only transport changes.
 */
import {invoke} from '@tauri-apps/api/core';
import {createLanChannel} from './lan_channel.js';
import {listen} from '@tauri-apps/api/event';
import {Window_SetChannelFactory,Window_Host} from '../engine/net/net_window.js';
import {CL_SuspendGameButtons} from '../engine/client/cl_input.js';
let active=null,game=null,panel=null;
function endSession(state){
 if(!state||state!==active)return;
 state.closed=true;clearTimeout(state.timer);active=null;invoke('lan_stop').catch(console.error);
}

async function stop(){
 const state=active;if(state){state.closed=true;clearTimeout(state.timer);active=null;}
 await invoke('lan_stop');
 globalThis.Cbuf_AddText?.('disconnect\nwindowhost -\nmaxplayers 1\n');
 // Let the existing engine close its sockets before installing a new channel.
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 Window_Host(null);
}
export async function LAN_Init(context){
 game=context;
 Window_SetChannelFactory((session,id)=>session==='lan'&&active?createLanChannel(active,id,{invoke,endSession}):null);
 globalThis.__QUAKED_LAN_MENU__=LAN_Show;
 addEventListener('pagehide',()=>{if(active)invoke('lan_stop').catch(()=>{});});
}
export function LAN_Show(){
 document.exitPointerLock?.();CL_SuspendGameButtons();if(panel)return;
 panel=document.createElement('dialog');panel.setAttribute('aria-label','LAN Multiplayer');
 panel.style='background:#211a12;color:#eedcbc;border:1px solid #927953;padding:24px;min-width:360px;font:18px sans-serif;z-index:1000';
 panel.innerHTML='<h2>LAN Multiplayer</h2><p>Both players need the same game and game files.</p><label>Host IP and port <input id="lan-address" placeholder="192.168.1.10:26000"></label><p><label>Mode <select id="lan-mode"><option value="coop">Cooperative</option><option value="deathmatch">Deathmatch</option></select></label></p><p><label>Map <select id="lan-map"></select></label></p><p id="lan-status" role="status"></p><button id="lan-host">Host LAN Game</button> <button id="lan-join">Join LAN Game</button> <button id="lan-leave">Leave LAN</button> <button id="lan-close">Close</button>';
 document.body.append(panel);panel.showModal();
 for(const type of ['keydown','keyup','pointerdown','pointerup','mousedown','mouseup','wheel'])panel.addEventListener(type,event=>event.stopPropagation());
 const q=id=>panel.querySelector('#'+id),status=q('lan-status');
 for(const map of game?.maps??[]){const o=document.createElement('option');o.value=map;o.textContent=map;q('lan-map').append(o);}
 if(game?.maps.includes('e1m1'))q('lan-map').value='e1m1';
 const close=()=>{panel?.remove();panel=null;};q('lan-close').onclick=close;panel.addEventListener('cancel',close);
 let busy=false;
 const controls=[q('lan-host'),q('lan-join'),q('lan-leave')];
 const start=async(host)=>{
  if(busy)return;busy=true;controls.forEach(button=>button.disabled=true);
  try{
   if(!game||typeof globalThis.Cbuf_AddText!=='function')throw Error('Select a game and wait for it to load first.');
   const address=q('lan-address').value.trim(),mode=q('lan-mode').value,map=q('lan-map').value;
   if(!host&&!/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(address))throw Error('Enter the host IPv4 address and port.');
   if(host&&!game.maps.includes(map))throw Error('Choose an installed map.');
   status.textContent='Checking game files…';const fingerprint=await game.identity();await stop();
   const state={out:[],sending:false,closed:false,peers:new Set(),address,fingerprint,ready:Promise.resolve()};active=state;
   if(host){
    const bound=await invoke('lan_host',{fingerprint,port:26000});
    globalThis.Cbuf_AddText(`disconnect\nmaxplayers 4\ncoop ${mode==='coop'?1:0}\ndeathmatch ${mode==='deathmatch'?1:0}\nwindowhost lan\nmap ${map}\n`);
    status.textContent='Hosting at '+bound+'. Enter this address on the other Mac. Close this panel to play.';
   }else{globalThis.Cbuf_AddText('disconnect\nconnect window:lan\n');close();}
  }catch(error){if(active)await stop();status.textContent=String(error);}
  finally{busy=false;controls.forEach(button=>button.disabled=false);}
 };
 q('lan-host').onclick=()=>start(true);q('lan-join').onclick=()=>start(false);q('lan-leave').onclick=async()=>{await stop();status.textContent='Disconnected.';};
}

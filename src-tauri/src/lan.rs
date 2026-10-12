//! Framed LAN transport for the existing Window Quake driver. No game simulation
//! or PAK bytes cross this boundary. Host authority and per-peer order are enforced here.
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    net::{Shutdown, SocketAddr, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
pub const MAX_FRAME: usize = 512 * 1024;
const MAX_QUEUE: usize = 256;
type Peer = Arc<Mutex<TcpStream>>;
#[derive(Default)]
struct Inner {
    epoch: AtomicU64,
    active: AtomicBool,
    host: AtomicBool,
    peers: Mutex<HashMap<String, Peer>>,
    queue: Mutex<VecDeque<Value>>,
    error: Mutex<Option<String>>,
    listener: Mutex<Option<thread::JoinHandle<()>>>,
}
#[derive(Clone, Default)]
pub struct Lan {
    inner: Arc<Inner>,
}
pub fn read_frame(reader: &mut impl Read) -> Result<Value, String> {
    let mut header = [0; 4];
    reader.read_exact(&mut header).map_err(|e| e.to_string())?;
    let length = u32::from_be_bytes(header) as usize;
    if length == 0 || length > MAX_FRAME {
        return Err("Invalid LAN frame size".into());
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
pub fn write_frame(writer: &mut impl Write, message: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(message).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_FRAME {
        return Err("LAN frame too large".into());
    }
    writer
        .write_all(&(bytes.len() as u32).to_be_bytes())
        .and_then(|_| writer.write_all(&bytes))
        .map_err(|e| e.to_string())
}
pub fn validate_packet(message: &Value, from: &str, client: bool) -> Result<(), String> {
    if message["from"] != from || client && message["to"] != "host" {
        return Err("Invalid LAN peer identity".into());
    }
    let kind = message["k"].as_str().ok_or("Missing LAN packet kind")?;
    if !(if client {
        &["join", "msg", "close"][..]
    } else {
        &["accept", "refuse", "msg", "close"][..]
    })
    .contains(&kind)
    {
        return Err("Invalid LAN packet kind".into());
    }
    if kind == "msg" {
        if !matches!(message["r"].as_u64(), Some(0 | 1)) {
            return Err("Invalid reliability flag".into());
        }
        let bytes = message["b"].as_array().ok_or("Missing packet bytes")?;
        if bytes.len() > 65536 || bytes.iter().any(|n| n.as_u64().is_none_or(|n| n > 255)) {
            return Err("Invalid engine payload".into());
        }
    }
    Ok(())
}
impl Lan {
    pub fn stop(&self) {
        self.inner.active.store(false, Ordering::SeqCst);
        self.inner.epoch.fetch_add(1, Ordering::SeqCst);
        for peer in self.inner.peers.lock().unwrap().drain().map(|(_, p)| p) {
            let _ = peer.lock().unwrap().shutdown(Shutdown::Both);
        }
        if let Some(handle) = self.inner.listener.lock().unwrap().take() {
            let _ = handle.join();
        }
        self.inner.queue.lock().unwrap().clear();
    }
    fn reset(&self, host: bool) -> u64 {
        self.stop();
        self.inner.host.store(host, Ordering::SeqCst);
        self.inner.active.store(true, Ordering::SeqCst);
        *self.inner.error.lock().unwrap() = None;
        self.inner.epoch.load(Ordering::SeqCst)
    }
    fn current(&self, epoch: u64) -> bool {
        self.inner.active.load(Ordering::SeqCst) && self.inner.epoch.load(Ordering::SeqCst) == epoch
    }
    fn push(&self, epoch: u64, mut message: Value) -> Result<(), String> {
        if !self.current(epoch) {
            return Err("Previous LAN session".into());
        }
        if let Some(object) = message.as_object_mut() {
            object.retain(|key, _| ["k", "from", "to", "r", "b", "reason"].contains(&key.as_str()));
        }
        let mut queue = self.inner.queue.lock().unwrap();
        if message["k"] == "msg"
            && message["r"] == 0
            && queue.back().is_some_and(|last| {
                last["k"] == "msg"
                    && last["r"] == 0
                    && last["from"] == message["from"]
                    && last["to"] == message["to"]
            })
        {
            queue.pop_back();
        }
        let payload_bytes: usize = queue
            .iter()
            .map(|p| p["b"].as_array().map_or(0, Vec::len))
            .sum();
        if queue.len() >= MAX_QUEUE
            || payload_bytes + message["b"].as_array().map_or(0, Vec::len) > 1024 * 1024
        {
            return Err("LAN receive queue overflow".into());
        }
        queue.push_back(message);
        Ok(())
    }
    fn reader(&self, mut stream: TcpStream, peer: String, epoch: u64, client_side: bool) {
        let this = self.clone();
        thread::spawn(move || {
            while this.current(epoch) {
                let message = match read_frame(&mut stream) {
                    Ok(m) => m,
                    Err(_) => break,
                };
                if validate_packet(
                    &message,
                    if client_side { "host" } else { &peer },
                    !client_side,
                )
                .is_err()
                {
                    break;
                }
                if client_side && message["to"] != peer {
                    break;
                }
                if let Err(error) = this.push(epoch, message) {
                    if client_side {
                        *this.inner.error.lock().unwrap() = Some(error);
                    }
                    break;
                }
            }
            let _ = stream.shutdown(Shutdown::Both);
            if this.current(epoch) {
                this.inner
                    .peers
                    .lock()
                    .unwrap()
                    .remove(if client_side { "host" } else { &peer });
                let _=this.push(epoch,json!({"k":"close","from":if client_side{"host"}else{&peer},"to":if client_side{&peer}else{"host"}}));
            }
        });
    }
    pub fn host(&self, address: &str, fingerprint: String) -> Result<String, String> {
        if fingerprint.is_empty() || fingerprint.len() > 1024 {
            return Err("Invalid game fingerprint".into());
        }
        let epoch = self.reset(true);
        let listener = TcpListener::bind(address).map_err(|e| format!("Cannot host LAN: {e}"))?;
        let bound = listener.local_addr().map_err(|e| e.to_string())?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let this = self.clone();
        let handle = thread::spawn(move || {
            while this.current(epoch) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        // Darwin inherits O_NONBLOCK from the listening socket on accept.
                        if stream.set_nonblocking(false).is_err() {
                            continue;
                        }
                        if this.inner.peers.lock().unwrap().len() >= 3 {
                            let _ = stream.shutdown(Shutdown::Both);
                            continue;
                        }
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
                        let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
                        let _ = stream.set_nodelay(true);
                        let hello = read_frame(&mut stream);
                        let Ok(hello) = hello else {
                            continue;
                        };
                        let peer = hello["peer"].as_str().unwrap_or("").to_string();
                        if hello["fingerprint"] != fingerprint
                            || peer.len() != 16
                            || !peer.bytes().all(|b| b.is_ascii_hexdigit())
                            || this.inner.peers.lock().unwrap().contains_key(&peer)
                        {
                            let _ = write_frame(
                                &mut stream,
                                &json!({"error":"Game files or engine version differ, or peer identity is invalid"}),
                            );
                            continue;
                        }
                        if !this.current(epoch) {
                            break;
                        }
                        if write_frame(&mut stream, &json!({"ok":true})).is_err() {
                            continue;
                        }
                        let _ = stream.set_read_timeout(None);
                        let Ok(writer) = stream.try_clone() else {
                            continue;
                        };
                        this.inner
                            .peers
                            .lock()
                            .unwrap()
                            .insert(peer.clone(), Arc::new(Mutex::new(writer)));
                        this.reader(stream, peer, epoch, false);
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(20))
                    }
                    Err(error) => {
                        *this.inner.error.lock().unwrap() = Some(error.to_string());
                        break;
                    }
                }
            }
        });
        *self.inner.listener.lock().unwrap() = Some(handle);
        let advertised = if bound.ip().is_unspecified() {
            std::net::UdpSocket::bind("0.0.0.0:0")
                .and_then(|socket| {
                    socket.connect("192.0.2.1:1")?;
                    socket.local_addr()
                })
                .map(|addr| SocketAddr::new(addr.ip(), bound.port()))
                .unwrap_or(bound)
        } else {
            bound
        };
        Ok(advertised.to_string())
    }
    pub fn join(&self, address: &str, fingerprint: &str, peer: &str) -> Result<(), String> {
        let address: SocketAddr = address
            .parse()
            .map_err(|_| "Enter an IP address and port, for example 192.168.1.10:26000")?;
        let epoch = self.reset(false);
        let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))
            .map_err(|e| format!("Cannot join LAN: {e}"))?;
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .map_err(|e| e.to_string())?;
        stream
            .set_write_timeout(Some(Duration::from_secs(3)))
            .map_err(|e| e.to_string())?;
        stream.set_nodelay(true).map_err(|e| e.to_string())?;
        write_frame(&mut stream, &json!({"fingerprint":fingerprint,"peer":peer}))?;
        let reply = read_frame(&mut stream)?;
        if reply["ok"] != true {
            return Err(reply["error"]
                .as_str()
                .unwrap_or("Host refused the connection")
                .to_string());
        }
        stream.set_read_timeout(None).map_err(|e| e.to_string())?;
        let writer = stream.try_clone().map_err(|e| e.to_string())?;
        {
            let mut peers = self.inner.peers.lock().unwrap();
            if !self.current(epoch) {
                let _ = stream.shutdown(Shutdown::Both);
                return Err("LAN join cancelled".into());
            }
            peers.insert("host".into(), Arc::new(Mutex::new(writer)));
        }
        self.reader(stream, peer.to_string(), epoch, true);
        Ok(())
    }
    pub fn send(&self, message: Value) -> Result<(), String> {
        let host = self.inner.host.load(Ordering::SeqCst);
        let from = message["from"].as_str().ok_or("Missing sender")?;
        validate_packet(&message, if host { "host" } else { from }, !host)?;
        let to = message["to"].as_str().ok_or("Missing recipient")?;
        let peer = self
            .inner
            .peers
            .lock()
            .unwrap()
            .get(to)
            .cloned()
            .ok_or("LAN peer disconnected")?;
        let result = write_frame(&mut *peer.lock().unwrap(), &message);
        if result.is_err() {
            let _ = peer.lock().unwrap().shutdown(Shutdown::Both);
        }
        result
    }
    pub fn poll(&self) -> Result<Vec<Value>, String> {
        if let Some(error) = self.inner.error.lock().unwrap().take() {
            return Err(error);
        }
        Ok(self.inner.queue.lock().unwrap().drain(..).collect())
    }
}

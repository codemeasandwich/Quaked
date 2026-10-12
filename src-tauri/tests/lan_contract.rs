//! Independent tests of the public LAN transport. Loopback verifies real TCP
//! framing/routing; it does not claim two-Mac firewall or gameplay acceptance.
#[path = "../src/lan.rs"]
#[allow(dead_code)]
mod lan;

use lan::{read_frame, validate_packet, write_frame, Lan, MAX_FRAME};
use serde_json::{json, Value};
use std::{
    io::{self, Cursor, Read},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

const ID_A: &str = "1111111111111111";
const ID_B: &str = "2222222222222222";
const ID_C: &str = "3333333333333333";
const ID_D: &str = "4444444444444444";
const GAME: &str = "contract-engine-v1:quake:pak0-sha:pak1-sha";
struct Session(Lan);
impl Session {
    fn new() -> Self {
        Self(Lan::default())
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        self.0.stop();
    }
}
fn packet(from: &str, to: &str, byte: u8) -> Value {
    json!({"k":"msg","from":from,"to":to,"r":1,"b":[byte]})
}
fn wait_messages(endpoint: &Lan, minimum: usize) -> Vec<Value> {
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut messages = Vec::new();
    loop {
        messages.extend(endpoint.poll().expect("transport has no hidden error"));
        if messages.len() >= minimum {
            return messages;
        }
        assert!(
            Instant::now() < deadline,
            "timed out waiting for {minimum} messages; received {messages:?}"
        );
        thread::sleep(Duration::from_millis(5));
    }
}
struct Fragmented {
    bytes: Cursor<Vec<u8>>,
    maximum: usize,
}
impl Read for Fragmented {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let length = buffer.len().min(self.maximum);
        self.bytes.read(&mut buffer[..length])
    }
}

#[test]
fn full_engine_payload_survives_fragmented_and_coalesced_frames() {
    let bytes: Vec<u8> = (0..65_536).map(|i| (i % 256) as u8).collect();
    let message = json!({"k":"msg","from":ID_A,"to":"host","r":1,"b":bytes});
    validate_packet(&message, ID_A, true).unwrap();
    let second = json!({"k":"close","from":ID_A,"to":"host"});
    let mut stream = Vec::new();
    write_frame(&mut stream, &message).unwrap();
    assert!(
        stream.len() < MAX_FRAME + 4,
        "JSON expansion fits the framing limit"
    );
    write_frame(&mut stream, &second).unwrap();
    let mut fragmented = Fragmented {
        bytes: Cursor::new(stream),
        maximum: 3,
    };
    assert_eq!(read_frame(&mut fragmented).unwrap(), message);
    assert_eq!(read_frame(&mut fragmented).unwrap(), second);
    assert!(
        read_frame(&mut fragmented).is_err(),
        "EOF is not another message"
    );
}

#[test]
fn malformed_lengths_truncation_and_engine_payloads_are_rejected() {
    for length in [0_u32, (MAX_FRAME + 1) as u32, u32::MAX] {
        assert!(read_frame(&mut Cursor::new(length.to_be_bytes())).is_err());
    }
    assert!(read_frame(&mut Cursor::new(vec![0, 0, 0])).is_err());
    assert!(read_frame(&mut Cursor::new(vec![0, 0, 0, 3, b'{'])).is_err());
    assert!(read_frame(&mut Cursor::new(vec![0, 0, 0, 1, b'?'])).is_err());
    assert!(write_frame(&mut Vec::new(), &json!({"huge":"x".repeat(MAX_FRAME)})).is_err());
    for bytes in [
        json!([256]),
        json!([-1]),
        json!([0.5]),
        json!("not bytes"),
        json!(vec![0; 65_537]),
    ] {
        assert!(validate_packet(
            &json!({"k":"msg","from":ID_A,"to":"host","r":1,"b":bytes}),
            ID_A,
            true
        )
        .is_err());
    }
}

#[test]
fn message_direction_and_peer_identity_cannot_be_forged() {
    assert!(validate_packet(&packet(ID_B, "host", 1), ID_A, true).is_err());
    assert!(validate_packet(&packet(ID_A, ID_B, 1), ID_A, true).is_err());
    assert!(validate_packet(&packet(ID_A, "host", 1), "host", false).is_err());
    for kind in ["accept", "refuse", "hello", "unknown"] {
        assert!(validate_packet(&json!({"k":kind,"from":ID_A,"to":"host"}), ID_A, true).is_err());
    }
    assert!(validate_packet(&json!({"k":"join","from":"host","to":ID_A}), "host", false).is_err());
    for reliability in [json!(-1), json!(2), json!(true), Value::Null] {
        assert!(validate_packet(
            &json!({"k":"msg","from":ID_A,"to":"host","r":reliability,"b":[1]}),
            ID_A,
            true
        )
        .is_err());
    }
}

#[test]
fn real_tcp_handshake_refuses_mismatch_then_transfers_full_binary_payload() {
    let host = Session::new();
    let client = Session::new();
    let address = host.0.host("127.0.0.1:0", GAME.into()).unwrap();
    assert!(client
        .0
        .join(&address, "different-engine-or-data", ID_A)
        .is_err());
    assert!(
        host.0.poll().unwrap().is_empty(),
        "mismatch cannot enter the engine join queue"
    );
    client.0.join(&address, GAME, ID_A).unwrap();
    let hello = json!({"k":"join","from":ID_A,"to":"host"});
    client.0.send(hello.clone()).unwrap();
    assert_eq!(wait_messages(&host.0, 1), [hello]);
    let bytes: Vec<u8> = (0..65_536).map(|i| (i % 256) as u8).collect();
    let message = json!({"k":"msg","from":"host","to":ID_A,"r":1,"b":bytes});
    host.0.send(message.clone()).unwrap();
    assert_eq!(wait_messages(&client.0, 1), [message]);
}

#[test]
fn three_remote_peers_are_isolated_and_leaving_one_does_not_stop_the_others() {
    let host = Session::new();
    let a = Session::new();
    let b = Session::new();
    let c = Session::new();
    let extra = Session::new();
    let address = host.0.host("127.0.0.1:0", GAME.into()).unwrap();
    for (client, id) in [(&a, ID_A), (&b, ID_B), (&c, ID_C)] {
        client.0.join(&address, GAME, id).unwrap();
    }
    assert!(
        extra.0.join(&address, GAME, ID_D).is_err(),
        "four slots include the host"
    );
    for (client, id, byte) in [(&a, ID_A, 1), (&b, ID_B, 2), (&c, ID_C, 3)] {
        let message = packet("host", id, byte);
        host.0.send(message.clone()).unwrap();
        assert_eq!(wait_messages(&client.0, 1), [message]);
    }
    assert!(a.0.poll().unwrap().is_empty());
    assert!(b.0.poll().unwrap().is_empty());
    assert!(c.0.poll().unwrap().is_empty());
    b.0.stop();
    let closed = wait_messages(&host.0, 1);
    assert!(closed
        .iter()
        .any(|m| m["k"] == "close" && m["from"] == ID_B));
    let message = packet(ID_A, "host", 9);
    a.0.send(message.clone()).unwrap();
    assert_eq!(wait_messages(&host.0, 1), [message]);
    let message = packet("host", ID_C, 10);
    host.0.send(message.clone()).unwrap();
    assert_eq!(wait_messages(&c.0, 1), [message]);
}

#[test]
fn spoofed_stream_is_closed_without_delivering_its_message_to_the_host() {
    let host = Session::new();
    let address = host.0.host("127.0.0.1:0", GAME.into()).unwrap();
    let mut stream = TcpStream::connect(address).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    write_frame(&mut stream, &json!({"fingerprint":GAME,"peer":ID_A})).unwrap();
    assert_eq!(read_frame(&mut stream).unwrap()["ok"], true);
    write_frame(&mut stream, &packet(ID_B, "host", 42)).unwrap();
    let messages = wait_messages(&host.0, 1);
    assert!(
        messages.iter().all(|m| m["k"] != "msg"),
        "forged data never reaches Quake"
    );
    assert!(messages
        .iter()
        .any(|m| m["k"] == "close" && m["from"] == ID_A));
}

#[test]
fn stop_disconnects_peers_and_rehost_has_no_previous_session_messages() {
    let host = Session::new();
    let client = Session::new();
    let old_address = host.0.host("127.0.0.1:0", GAME.into()).unwrap();
    client.0.join(&old_address, GAME, ID_A).unwrap();
    host.0.stop();
    assert!(wait_messages(&client.0, 1)
        .iter()
        .any(|m| m["k"] == "close" && m["from"] == "host"));
    client.0.stop();
    let address = host.0.host("127.0.0.1:0", GAME.into()).unwrap();
    client.0.join(&address, GAME, ID_A).unwrap();
    let message = packet(ID_A, "host", 25);
    client.0.send(message.clone()).unwrap();
    assert_eq!(wait_messages(&host.0, 1), [message]);
    assert!(
        client.0.poll().unwrap().is_empty(),
        "old session close does not leak into new session"
    );
}

#[test]
fn delayed_join_success_cannot_resurrect_a_stopped_or_replaced_session() {
    for replace_with_host in [false, true] {
        let endpoint = Session::new();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap().to_string();
        let (hello_sent, hello_seen) = mpsc::sync_channel(1);
        let (release, released) = mpsc::sync_channel(1);
        let delayed_host = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let hello = read_frame(&mut stream).unwrap();
            assert_eq!(hello["peer"], ID_A);
            hello_sent.send(()).unwrap();
            released.recv_timeout(Duration::from_secs(5)).unwrap();
            write_frame(&mut stream, &json!({"ok":true})).unwrap();
        });
        let joining = endpoint.0.clone();
        let (finished, result) = mpsc::sync_channel(1);
        let pending_join = thread::spawn(move || {
            finished.send(joining.join(&address, GAME, ID_A)).unwrap();
        });
        hello_seen.recv_timeout(Duration::from_secs(5)).unwrap();
        let replacement = if replace_with_host {
            Some(endpoint.0.host("127.0.0.1:0", GAME.into()).unwrap())
        } else {
            endpoint.0.stop();
            None
        };
        release.send(()).unwrap();
        let answer = result.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(
            answer
                .as_ref()
                .err()
                .is_some_and(|error| error.contains("cancel")),
            "delayed success must not replace the current session: {answer:?}"
        );
        pending_join.join().unwrap();
        delayed_host.join().unwrap();
        assert!(
            endpoint.0.poll().unwrap().is_empty(),
            "cancelled join delivers no stale events"
        );
        if let Some(address) = replacement {
            let peer = Session::new();
            peer.0.join(&address, GAME, ID_B).unwrap();
            let message = packet(ID_B, "host", 37);
            peer.0.send(message.clone()).unwrap();
            assert_eq!(
                wait_messages(&endpoint.0, 1),
                [message],
                "replacement host remains usable"
            );
        } else {
            assert!(
                endpoint.0.send(packet(ID_A, "host", 38)).is_err(),
                "stopped join installs no hidden connection"
            );
        }
    }
}

#[test]
fn byte_queue_overflow_disconnects_only_the_flooding_peer() {
    let host = Session::new();
    let noisy = Session::new();
    let healthy = Session::new();
    let address = host.0.host("127.0.0.1:0", GAME.into()).unwrap();
    noisy.0.join(&address, GAME, ID_A).unwrap();
    healthy.0.join(&address, GAME, ID_B).unwrap();
    let large = json!({"k":"msg","from":ID_A,"to":"host","r":1,"b":vec![255; 65_536]});
    // Deliberately do not poll the host: 17 reliable full-sized payloads exceed
    // the byte budget well before the independent packet-count bound.
    for _ in 0..18 {
        if noisy.0.send(large.clone()).is_err() {
            break;
        }
    }
    assert!(wait_messages(&noisy.0, 1)
        .iter()
        .any(|m| m["k"] == "close" && m["from"] == "host"));
    let mut queued = host
        .0
        .poll()
        .expect("one peer overflowing does not poison the host session");
    if !queued
        .iter()
        .any(|m| m["k"] == "close" && m["from"] == ID_A)
    {
        // The peer can observe EOF just before the host queues its close event.
        queued.extend(wait_messages(&host.0, 1));
    }
    let bytes: usize = queued
        .iter()
        .map(|m| m["b"].as_array().map_or(0, Vec::len))
        .sum();
    assert!(
        bytes <= 1024 * 1024,
        "received payload memory is bounded: {bytes}"
    );
    assert!(queued
        .iter()
        .any(|m| m["k"] == "close" && m["from"] == ID_A));
    let message = packet(ID_B, "host", 39);
    healthy.0.send(message.clone()).unwrap();
    assert_eq!(wait_messages(&host.0, 1), [message]);
    let reply = packet("host", ID_B, 40);
    host.0.send(reply.clone()).unwrap();
    assert_eq!(wait_messages(&healthy.0, 1), [reply]);
}

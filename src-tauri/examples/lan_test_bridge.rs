//! Test-only line-JSON bridge to the production LAN transport. It is not shipped
//! with Quaked and adds no server simulation, wire parser or alternate transport.
#[path = "../src/lan.rs"]
mod lan;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

fn text<'a>(request: &'a Value, name: &str) -> Result<&'a str, String> {
    request[name]
        .as_str()
        .ok_or_else(|| format!("Missing string {name}"))
}
fn dispatch(endpoint: &lan::Lan, request: &Value) -> Result<Value, String> {
    match text(request, "command")? {
        "host" => endpoint
            .host(
                text(request, "address")?,
                text(request, "fingerprint")?.into(),
            )
            .map(Value::String),
        "join" => endpoint
            .join(
                text(request, "address")?,
                text(request, "fingerprint")?,
                text(request, "peer")?,
            )
            .map(|_| json!(true)),
        "send" => endpoint
            .send(request["message"].clone())
            .map(|_| json!(true)),
        "poll" => endpoint.poll().map(|messages| json!(messages)),
        "stop" | "quit" => {
            endpoint.stop();
            Ok(json!(true))
        }
        _ => Err("Unknown bridge command".into()),
    }
}
fn main() {
    let endpoint = lan::Lan::default();
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(_) => break,
        };
        let request = match serde_json::from_str::<Value>(&line) {
            Ok(request) => request,
            Err(error) => {
                let _ = writeln!(
                    stdout,
                    "{}",
                    json!({"id":null,"ok":false,"error":error.to_string()})
                );
                let _ = stdout.flush();
                continue;
            }
        };
        let reply = match dispatch(&endpoint, &request) {
            Ok(result) => json!({"id":request["id"],"ok":true,"result":result}),
            Err(error) => json!({"id":request["id"],"ok":false,"error":error}),
        };
        if writeln!(stdout, "{reply}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
        if request["command"] == "quit" {
            break;
        }
    }
    endpoint.stop();
}

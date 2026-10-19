//! Read-only receipt from the exact scanner used by the native game shelf.
//! Usage: cargo run --example library_inventory -- /path/to/game-library
#[path = "../src/library.rs"]
mod library;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::args_os().nth(1).ok_or("Supply the game library path")?;
    let scanned = library::scan(std::path::Path::new(&root))?;
    serde_json::to_writer_pretty(std::io::stdout(), &scanned)?;
    println!();
    Ok(())
}

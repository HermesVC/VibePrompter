//! Symbol outline extraction for PHP, JavaScript, and Python.

mod parser;
mod types;

pub use parser::{find_symbol, format_outline_text, outline_for_file};
pub use types::FileOutline;

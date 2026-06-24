//! Symbol outline types for smart file inspection.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SymbolKind {
    Class,
    Interface,
    Trait,
    Function,
    Method,
    Constructor,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolEntry {
    pub kind: SymbolKind,
    pub name: String,
    pub qualified_name: String,
    pub signature: String,
    pub line_start: u32,
    pub line_end: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOutline {
    pub path: String,
    pub language: String,
    pub line_count: u32,
    pub parseable: bool,
    pub symbols: Vec<SymbolEntry>,
}

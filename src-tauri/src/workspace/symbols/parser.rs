//! Heuristic symbol extraction for PHP, JavaScript, and Python.

use std::path::Path;

use regex::Regex;

use super::types::{FileOutline, SymbolEntry, SymbolKind};

pub fn outline_for_file(path: &str, content: &str) -> FileOutline {
    let language = language_id(path);
    let line_count = content.lines().count().max(1) as u32;
    let parseable = matches!(language.as_str(), "php" | "javascript" | "python");
    let symbols = if parseable {
        match language.as_str() {
            "php" => parse_php(content),
            "javascript" => parse_javascript(content),
            "python" => parse_python(content),
            _ => Vec::new(),
        }
    } else {
        Vec::new()
    };

    FileOutline {
        path: path.to_string(),
        language,
        line_count,
        parseable,
        symbols,
    }
}

pub fn find_symbol<'a>(outline: &'a FileOutline, query: &str) -> Option<&'a SymbolEntry> {
    let q = query.trim();
    if q.is_empty() {
        return None;
    }
    let q_lower = q.to_ascii_lowercase();
    outline
        .symbols
        .iter()
        .find(|s| {
            s.name.eq_ignore_ascii_case(q)
                || s.qualified_name.eq_ignore_ascii_case(q)
                || s.qualified_name
                    .to_ascii_lowercase()
                    .ends_with(&format!("::{q_lower}"))
                || s.qualified_name
                    .to_ascii_lowercase()
                    .ends_with(&format!(".{q_lower}"))
        })
        .or_else(|| {
            outline.symbols.iter().find(|s| {
                s.name.to_ascii_lowercase().contains(&q_lower)
                    || s.qualified_name.to_ascii_lowercase().contains(&q_lower)
            })
        })
}

fn language_id(path: &str) -> String {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "php" | "phtml" | "inc" => "php".into(),
        "js" | "jsx" | "mjs" | "cjs" => "javascript".into(),
        "py" | "pyw" => "python".into(),
        other => other.to_string(),
    }
}

fn parse_php(content: &str) -> Vec<SymbolEntry> {
    let lines: Vec<&str> = content.lines().collect();
    let mut symbols = Vec::new();
    let mut current_class: Option<String> = None;

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        let line_no = (idx + 1) as u32;

        if let Some(name) = capture(trimmed, r"(?i)^(?:abstract\s+|final\s+)?class\s+(\w+)") {
            current_class = Some(name.clone());
            let end = block_end_line(&lines, idx, '{', '}');
            symbols.push(SymbolEntry {
                kind: SymbolKind::Class,
                name: name.clone(),
                qualified_name: name,
                signature: trimmed.to_string(),
                line_start: line_no,
                line_end: end,
            });
            continue;
        }
        if let Some(name) = capture(trimmed, r"(?i)^interface\s+(\w+)") {
            current_class = Some(name.clone());
            let end = block_end_line(&lines, idx, '{', '}');
            symbols.push(SymbolEntry {
                kind: SymbolKind::Interface,
                name: name.clone(),
                qualified_name: name,
                signature: trimmed.to_string(),
                line_start: line_no,
                line_end: end,
            });
            continue;
        }
        if let Some(name) = capture(trimmed, r"(?i)^trait\s+(\w+)") {
            current_class = Some(name.clone());
            let end = block_end_line(&lines, idx, '{', '}');
            symbols.push(SymbolEntry {
                kind: SymbolKind::Trait,
                name: name.clone(),
                qualified_name: name,
                signature: trimmed.to_string(),
                line_start: line_no,
                line_end: end,
            });
            continue;
        }

        if let Some(name) = capture(
            trimmed,
            r"(?i)^(?:public|protected|private|static|\s)+function\s+(__construct|\w+)\s*\(",
        ) {
            let kind = if name == "__construct" {
                SymbolKind::Constructor
            } else {
                SymbolKind::Method
            };
            let end = block_end_line(&lines, idx, '{', '}');
            let qualified = current_class
                .as_ref()
                .map(|c| format!("{c}::{name}"))
                .unwrap_or_else(|| name.clone());
            symbols.push(SymbolEntry {
                kind,
                name: name.clone(),
                qualified_name: qualified,
                signature: trimmed.to_string(),
                line_start: line_no,
                line_end: end,
            });
            continue;
        }

        if current_class.is_none() {
            if let Some(name) = capture(trimmed, r"(?i)^function\s+(\w+)\s*\(") {
                let end = block_end_line(&lines, idx, '{', '}');
                symbols.push(SymbolEntry {
                    kind: SymbolKind::Function,
                    name: name.clone(),
                    qualified_name: name,
                    signature: trimmed.to_string(),
                    line_start: line_no,
                    line_end: end,
                });
            }
        }
    }
    symbols
}

fn parse_javascript(content: &str) -> Vec<SymbolEntry> {
    let lines: Vec<&str> = content.lines().collect();
    let mut symbols = Vec::new();
    let mut current_class: Option<String> = None;

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        let line_no = (idx + 1) as u32;

        if let Some(name) = capture(trimmed, r"(?i)^(?:export\s+)?(?:default\s+)?class\s+(\w+)") {
            current_class = Some(name.clone());
            let end = block_end_line(&lines, idx, '{', '}');
            symbols.push(SymbolEntry {
                kind: SymbolKind::Class,
                name: name.clone(),
                qualified_name: name,
                signature: trimmed.to_string(),
                line_start: line_no,
                line_end: end,
            });
            continue;
        }

        if let Some(name) = capture(
            trimmed,
            r"(?i)^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(",
        ) {
            let end = block_end_braces_or_line(&lines, idx);
            symbols.push(SymbolEntry {
                kind: SymbolKind::Function,
                name: name.clone(),
                qualified_name: name,
                signature: trimmed.to_string(),
                line_start: line_no,
                line_end: end,
            });
            continue;
        }

        if let Some(name) = capture(trimmed, r"^(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{") {
            if matches!(
                name.as_str(),
                "if" | "for" | "while" | "switch" | "catch" | "function"
            ) {
                continue;
            }
            let kind = if current_class.is_some() {
                SymbolKind::Method
            } else {
                SymbolKind::Function
            };
            let end = block_end_line(&lines, idx, '{', '}');
            let qualified = current_class
                .as_ref()
                .map(|c| format!("{c}.{name}"))
                .unwrap_or(name.clone());
            symbols.push(SymbolEntry {
                kind,
                name: name.clone(),
                qualified_name: qualified,
                signature: trimmed.to_string(),
                line_start: line_no,
                line_end: end,
            });
        }
    }
    symbols
}

fn parse_python(content: &str) -> Vec<SymbolEntry> {
    let lines: Vec<&str> = content.lines().collect();
    let mut symbols = Vec::new();
    let mut class_stack: Vec<(String, usize)> = Vec::new();

    for (idx, line) in lines.iter().enumerate() {
        let line_no = (idx + 1) as u32;
        let indent = line.chars().take_while(|c| *c == ' ' || *c == '\t').count();
        while class_stack.last().is_some_and(|(_, ci)| indent <= *ci) {
            class_stack.pop();
        }

        let trimmed = line.trim();
        if let Some(name) = capture(trimmed, r"^class\s+(\w+)") {
            let end = python_block_end(&lines, idx);
            class_stack.push((name.clone(), indent));
            symbols.push(SymbolEntry {
                kind: SymbolKind::Class,
                name: name.clone(),
                qualified_name: name,
                signature: trimmed.to_string(),
                line_start: line_no,
                line_end: end,
            });
            continue;
        }

        if let Some(name) = capture(trimmed, r"^def\s+(\w+)\s*\(") {
            let end = python_block_end(&lines, idx);
            let kind = if name == "__init__" {
                SymbolKind::Constructor
            } else if class_stack.is_empty() {
                SymbolKind::Function
            } else {
                SymbolKind::Method
            };
            let qualified = class_stack
                .last()
                .map(|(c, _)| format!("{c}.{name}"))
                .unwrap_or(name.clone());
            symbols.push(SymbolEntry {
                kind,
                name,
                qualified_name: qualified,
                signature: trimmed.to_string(),
                line_start: line_no,
                line_end: end,
            });
        }
    }
    symbols
}

fn capture(line: &str, pattern: &str) -> Option<String> {
    let re = Regex::new(pattern).ok()?;
    re.captures(line)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

fn block_end_line(lines: &[&str], start_idx: usize, open: char, close: char) -> u32 {
    let mut depth = 0i32;
    let mut started = false;
    for (i, line) in lines.iter().enumerate().skip(start_idx) {
        for ch in line.chars() {
            if ch == open {
                depth += 1;
                started = true;
            } else if ch == close && started {
                depth -= 1;
                if depth == 0 {
                    return (i + 1) as u32;
                }
            }
        }
    }
    lines.len() as u32
}

fn block_end_braces_or_line(lines: &[&str], start_idx: usize) -> u32 {
    if lines[start_idx].contains('{') {
        block_end_line(lines, start_idx, '{', '}')
    } else {
        (start_idx + 1) as u32
    }
}

fn python_block_end(lines: &[&str], start_idx: usize) -> u32 {
    let base_indent = lines[start_idx]
        .chars()
        .take_while(|c| *c == ' ' || *c == '\t')
        .count();
    for (i, line) in lines.iter().enumerate().skip(start_idx + 1) {
        if line.trim().is_empty() {
            continue;
        }
        let indent = line.chars().take_while(|c| *c == ' ' || *c == '\t').count();
        if indent <= base_indent {
            return i as u32;
        }
    }
    lines.len() as u32
}

/// Compact multi-line summary for folder scope prompts.
pub fn format_outline_text(outline: &FileOutline) -> String {
    if !outline.parseable {
        return format!(
            "{} ({} lines, use read_file)",
            outline.path, outline.line_count
        );
    }
    if outline.symbols.is_empty() {
        return format!("{} (no symbols detected)", outline.path);
    }
    let mut lines = vec![format!("{}:", outline.path)];
    for s in &outline.symbols {
        lines.push(format!(
            "  {} L{}-{} — {}",
            s.qualified_name, s.line_start, s.line_end, s.signature
        ));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_php_class_and_method() {
        let src = r#"<?php
class UserService {
    public function create(int $id): void {
        echo $id;
    }
}
"#;
        let outline = outline_for_file("src/UserService.php", src);
        assert!(outline.parseable);
        assert!(outline.symbols.iter().any(|s| s.name == "UserService"));
        assert!(outline.symbols.iter().any(|s| s.name == "create"));
    }

    #[test]
    fn parses_python_def() {
        let src = "class Foo:\n    def bar(self):\n        return 1\n";
        let outline = outline_for_file("m.py", src);
        assert!(outline
            .symbols
            .iter()
            .any(|s| s.qualified_name == "Foo.bar"));
    }

    #[test]
    fn finds_symbol_by_short_name() {
        let src = "class A { function go() {} }";
        let outline = outline_for_file("a.php", src);
        assert!(find_symbol(&outline, "go").is_some());
    }
}

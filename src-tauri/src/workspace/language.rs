//! Programming-language detection and system-prompt hints.

use std::path::Path;

#[derive(Debug, Clone)]
pub struct LanguageProfile {
    pub id: &'static str,
    pub extensions: &'static [&'static str],
    pub hints: &'static str,
}

const PROFILES: &[LanguageProfile] = &[
    LanguageProfile {
        id: "php",
        extensions: &["php", "phtml", "inc"],
        hints: "Follow PSR-12 where applicable. Preserve opening <?php tags and existing $MESS keys when editing language files.",
    },
    LanguageProfile {
        id: "typescript",
        extensions: &["ts", "tsx"],
        hints: "Use strict TypeScript idioms. Prefer explicit types on public APIs.",
    },
    LanguageProfile {
        id: "javascript",
        extensions: &["js", "jsx", "mjs", "cjs"],
        hints: "Match the surrounding module style (CommonJS vs ESM).",
    },
    LanguageProfile {
        id: "rust",
        extensions: &["rs"],
        hints: "Follow Rust idioms and keep unsafe blocks minimal.",
    },
    LanguageProfile {
        id: "python",
        extensions: &["py", "pyw"],
        hints: "Follow PEP 8 naming. Use type hints when editing function signatures.",
    },
    LanguageProfile {
        id: "html",
        extensions: &["html", "htm"],
        hints: "Keep markup semantic and accessible.",
    },
    LanguageProfile {
        id: "css",
        extensions: &["css", "scss", "sass", "less"],
        hints: "Match existing naming conventions in the stylesheet.",
    },
    LanguageProfile {
        id: "sql",
        extensions: &["sql"],
        hints: "Prefer portable SQL. Do not drop tables unless explicitly asked.",
    },
    LanguageProfile {
        id: "json",
        extensions: &["json"],
        hints: "Output must remain valid JSON.",
    },
    LanguageProfile {
        id: "yaml",
        extensions: &["yaml", "yml"],
        hints: "Preserve indentation style. Output valid YAML.",
    },
    LanguageProfile {
        id: "markdown",
        extensions: &["md", "markdown"],
        hints: "Use clean Markdown headings and lists.",
    },
    LanguageProfile {
        id: "toml",
        extensions: &["toml"],
        hints: "Output valid TOML.",
    },
    LanguageProfile {
        id: "plaintext",
        extensions: &["txt", "log", "ini", "env", "csv", "xml"],
        hints: "Preserve line-oriented structure.",
    },
];

pub fn profile(id: &str) -> Option<&'static LanguageProfile> {
    PROFILES.iter().find(|p| p.id == id)
}

pub fn detect_language(path: Option<&str>, content: Option<&str>) -> String {
    if let Some(p) = path {
        if let Some(ext) = Path::new(p).extension().and_then(|e| e.to_str()) {
            let ext = ext.to_ascii_lowercase();
            for prof in PROFILES {
                if prof.id == "plaintext" {
                    continue;
                }
                if prof.extensions.iter().any(|e| *e == ext) {
                    return prof.id.to_string();
                }
            }
        }
    }
    if let Some(c) = content {
        let trimmed = c.trim_start();
        if trimmed.starts_with("<?php") {
            return "php".into();
        }
        if trimmed.starts_with("{") || trimmed.starts_with("[") {
            return "json".into();
        }
    }
    "plaintext".into()
}

pub fn hints_for(id: &str) -> &'static str {
    profile(id)
        .map(|p| p.hints)
        .unwrap_or("Preserve formatting and meaning.")
}

pub fn list_profiles() -> Vec<(&'static str, &'static [&'static str])> {
    PROFILES
        .iter()
        .map(|p| (p.id, p.extensions))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_php_by_extension() {
        assert_eq!(detect_language(Some("foo.php"), None), "php");
    }

    #[test]
    fn detects_php_by_content() {
        assert_eq!(detect_language(None, Some("<?php echo 1;")), "php");
    }
}

//! Fact-preserving memory compression helpers.

use std::collections::HashSet;

use crate::models::ChatMessage;

const FACTS_HEADER: &str = "## FACTS (do not contradict)";
const FACTS_CHAR_FRACTION: f64 = 0.15;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FactKind {
    PlanCanonical,
    PlanProgress,
    Decision,
    Repo,
    Path,
}

impl FactKind {
    fn priority(&self) -> u8 {
        match self {
            Self::PlanCanonical => 0,
            Self::Decision => 1,
            Self::Path => 2,
            Self::Repo => 3,
            Self::PlanProgress => 4,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FactAtom {
    pub kind: FactKind,
    pub text: String,
    order: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryFacts {
    pub atoms: Vec<FactAtom>,
    pub narrative: String,
}

pub fn split_memory_facts(source: &str) -> MemoryFacts {
    let mut atoms = Vec::new();
    let mut narrative = Vec::new();
    let lines: Vec<&str> = source.lines().collect();
    let mut i = 0usize;
    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();
        if trimmed.is_empty() {
            narrative.push(line.to_string());
            i += 1;
            continue;
        }

        if trimmed.starts_with("COMPRESSED_MEMORY:") || trimmed.starts_with(FACTS_HEADER) {
            narrative.push(line.to_string());
            i += 1;
            continue;
        }

        if trimmed.starts_with("PLAN_CANONICAL") {
            let start = i;
            i += 1;
            while i < lines.len() && looks_like_plan_key(lines[i].trim()) {
                i += 1;
            }
            atoms.push(FactAtom {
                kind: FactKind::PlanCanonical,
                text: lines[start..i].join("\n").trim().to_string(),
                order: start,
            });
            continue;
        }

        if trimmed.starts_with("PLAN_PROGRESS:") {
            let start = i;
            i += 1;
            while i < lines.len() && looks_like_plan_key(lines[i].trim()) {
                i += 1;
            }
            atoms.push(FactAtom {
                kind: FactKind::PlanProgress,
                text: lines[start..i].join("\n").trim().to_string(),
                order: start,
            });
            continue;
        }

        if trimmed.starts_with("<plan-step-summary>") {
            let start = i;
            let mut block = String::new();
            while i < lines.len() {
                block.push_str(lines[i]);
                block.push('\n');
                if lines[i].trim().starts_with("</plan-step-summary>") {
                    break;
                }
                i += 1;
            }
            if let Some(inner) = crate::workspace::plan_memory::extract_plan_step_summary(&block) {
                atoms.push(FactAtom {
                    kind: FactKind::PlanProgress,
                    text: crate::workspace::plan_memory::format_plan_step_for_memory(&inner),
                    order: start,
                });
                i += 1;
                continue;
            }
        }

        if is_decision_line(trimmed) {
            atoms.push(FactAtom {
                kind: FactKind::Decision,
                text: trimmed.to_string(),
                order: i,
            });
        } else if is_repo_line(trimmed) {
            atoms.push(FactAtom {
                kind: FactKind::Repo,
                text: trimmed.to_string(),
                order: i,
            });
        } else if contains_workspace_path(trimmed) {
            atoms.push(FactAtom {
                kind: FactKind::Path,
                text: trimmed.to_string(),
                order: i,
            });
        } else {
            narrative.push(line.to_string());
        }
        i += 1;
    }

    MemoryFacts {
        atoms: dedupe_and_prioritize(atoms),
        narrative: narrative.join("\n").trim().to_string(),
    }
}

/// Collect structured facts from rolling memory plus every evicted turn.
///
/// Scans the full evicted batch (not only the tail sent to the compress LLM) so
/// early `DECISION:` / `PLAN_CANONICAL` lines are not dropped on large evictions.
pub fn collect_session_facts(prior_memory: &str, evicted: &[ChatMessage]) -> MemoryFacts {
    let mut parts = Vec::new();
    let prior = prior_memory.trim();
    if !prior.is_empty() {
        parts.push(prior.to_string());
    }
    for m in evicted {
        let content = m.content.trim();
        if !content.is_empty() {
            parts.push(content.to_string());
        }
    }
    if parts.is_empty() {
        return MemoryFacts {
            atoms: Vec::new(),
            narrative: String::new(),
        };
    }
    split_memory_facts(&parts.join("\n\n"))
}

pub fn merge_compressed_memory(
    facts: &MemoryFacts,
    compressed_narrative: &str,
    context_limit: i64,
) -> String {
    let fact_block = format_fact_block(&facts.atoms, context_limit);
    let narrative = compressed_narrative.trim();
    match (fact_block.is_empty(), narrative.is_empty()) {
        (true, true) => String::new(),
        (true, false) => narrative.to_string(),
        (false, true) => fact_block,
        (false, false) => format!("{fact_block}\n\n{narrative}"),
    }
}

fn format_fact_block(atoms: &[FactAtom], context_limit: i64) -> String {
    if atoms.is_empty() {
        return String::new();
    }
    let cap = fact_char_budget(context_limit);
    let mut out = String::from(FACTS_HEADER);
    let mut used = out.chars().count();
    for atom in atoms {
        let line = format!("\n- {}", atom.text.trim().replace('\n', "\n  "));
        let len = line.chars().count();
        if used + len > cap && used > FACTS_HEADER.len() {
            continue;
        }
        out.push_str(&line);
        used += len;
    }
    out
}

fn fact_char_budget(context_limit: i64) -> usize {
    let ctx = context_limit.max(8192) as f64;
    ((ctx * 4.0 * FACTS_CHAR_FRACTION) as usize).clamp(900, 8_000)
}

fn dedupe_and_prioritize(mut atoms: Vec<FactAtom>) -> Vec<FactAtom> {
    atoms.sort_by_key(|a| (a.kind.priority(), std::cmp::Reverse(a.order)));
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for atom in atoms {
        if seen.insert(fact_key(&atom)) {
            out.push(atom);
        }
    }
    out.sort_by_key(|a| (a.kind.priority(), a.order));
    out
}

fn fact_key(atom: &FactAtom) -> String {
    match atom.kind {
        FactKind::PlanCanonical => "plan-canonical".into(),
        FactKind::PlanProgress => {
            let step = extract_key_value(&atom.text, "step").unwrap_or_default();
            format!("plan-progress:{step}")
        }
        FactKind::Decision => {
            let text = atom
                .text
                .trim_start_matches("DECISION:")
                .trim_start_matches("Decision:")
                .trim();
            format!("decision:{}", normalize_key(text))
        }
        FactKind::Repo => format!("repo:{}", normalize_key(&atom.text)),
        FactKind::Path => workspace_paths(&atom.text)
            .into_iter()
            .next()
            .unwrap_or_else(|| normalize_key(&atom.text)),
    }
}

fn extract_key_value(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        if let Some((k, v)) = line.trim().split_once(':') {
            if k.trim().eq_ignore_ascii_case(key) {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

fn normalize_key(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

fn looks_like_plan_key(line: &str) -> bool {
    [
        "step:",
        "last_done:",
        "done:",
        "next:",
        "source:",
        "updated_at:",
        "why:",
    ]
    .iter()
    .any(|prefix| line.to_ascii_lowercase().starts_with(prefix))
}

fn is_decision_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.starts_with("decision:")
        || lower.starts_with("decided:")
        || lower.starts_with("решение:")
        || lower.starts_with("решили:")
}

fn is_repo_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.starts_with("repo:")
        || lower.starts_with("repo outline:")
        || lower.starts_with("project:")
        || lower.starts_with("context-file:")
}

fn contains_workspace_path(line: &str) -> bool {
    !workspace_paths(line).is_empty()
}

fn workspace_paths(line: &str) -> Vec<String> {
    line.split(|c: char| c.is_whitespace() || matches!(c, '`' | '"' | '\'' | '(' | ')' | ',' | ';'))
        .filter_map(|part| {
            let p = part.trim_matches(|c: char| matches!(c, ':' | '.' | ']' | '['));
            let lower = p.to_ascii_lowercase();
            if lower == "plan.md"
                || lower.starts_with("src/")
                || lower.starts_with("src-tauri/")
                || lower.starts_with("scripts/")
                || lower.ends_with("/plan.md")
                || lower.ends_with("\\plan.md")
            {
                Some(lower.replace('\\', "/"))
            } else {
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_session_facts_scans_oldest_evicted_turns() {
        let evicted = vec![
            ChatMessage {
                role: "user".into(),
                content: "DECISION: secret code VIBE-7749".into(),
                images: vec![],
            },
            ChatMessage {
                role: "assistant".into(),
                content: "ok".into(),
                images: vec![],
            },
            ChatMessage {
                role: "user".into(),
                content: "filler ".repeat(200),
                images: vec![],
            },
        ];
        let facts = collect_session_facts("", &evicted);
        assert!(facts
            .atoms
            .iter()
            .any(|a| a.kind == FactKind::Decision && a.text.contains("VIBE-7749")));
    }

    #[test]
    fn split_keeps_atomic_facts_out_of_narrative() {
        let src = "PLAN_CANONICAL v3\nstep: 3 / 7\nnext: validation\n\nDECISION: use sqlite\nNarrative sentence about the meeting.\nsrc-tauri/src/chat/vector_memory.rs changed";
        let facts = split_memory_facts(src);

        assert!(facts.narrative.contains("Narrative sentence"));
        assert!(!facts.narrative.contains("PLAN_CANONICAL"));
        assert!(!facts.narrative.contains("DECISION:"));
        assert_eq!(facts.atoms[0].kind, FactKind::PlanCanonical);
        assert!(facts
            .atoms
            .iter()
            .any(|a| a.text.contains("src-tauri/src/chat/vector_memory.rs")));
    }

    #[test]
    fn merge_preserves_facts_verbatim_before_narrative() {
        let facts = split_memory_facts("DECISION: keep Qwen local\nold narrative");
        let merged = merge_compressed_memory(&facts, "short narrative", 32_768);

        assert!(merged.starts_with("## FACTS"));
        assert!(merged.contains("DECISION: keep Qwen local"));
        assert!(merged.ends_with("short narrative"));
    }

    #[test]
    fn dedupe_keeps_latest_decision_by_position() {
        let facts =
            split_memory_facts("DECISION: use rolling memory\nnoise\nDECISION: use rolling memory");
        let decisions: Vec<_> = facts
            .atoms
            .iter()
            .filter(|a| a.kind == FactKind::Decision)
            .collect();

        assert_eq!(decisions.len(), 1);
        assert_eq!(decisions[0].order, 2);
    }

    #[test]
    fn plan_step_tag_becomes_plan_progress_fact() {
        let src =
            "<plan-step-summary>\nstep: 4 / 9\ndone: parser\nnext: tests\n</plan-step-summary>";
        let facts = split_memory_facts(src);

        assert!(facts
            .atoms
            .iter()
            .any(|a| a.kind == FactKind::PlanProgress && a.text.contains("PLAN_PROGRESS:")));
    }
}

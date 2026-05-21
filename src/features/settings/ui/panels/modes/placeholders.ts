/** Regex matching `{{ident}}` placeholders. Identifier must start with
 *  a letter or `_`, then any number of alphanumerics / underscores —
 *  the rules MUST match the Rust `extract_names` in
 *  services/prompt_template.rs or the UI will show variables the backend
 *  doesn't substitute. */
const PLACEHOLDER_RE = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

export function extractPlaceholders(prompt: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of prompt.matchAll(PLACEHOLDER_RE)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export function parseVarsJson(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = typeof val === 'string' ? val : String(val ?? '');
      }
      return out;
    }
  } catch {
    // Malformed JSON → treat as no variables; the editor recreates valid JSON on save.
  }
  return {};
}

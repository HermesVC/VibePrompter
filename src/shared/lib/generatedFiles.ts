export interface GeneratedFileBlock {
  path: string;
  language?: string;
  content: string;
  complete: boolean;
  startOffset: number;
  endOffset: number;
}

const FENCE_RE = /```([^\n\r]*)\r?\n/g;

export function parseGeneratedFileBlocks(text: string): GeneratedFileBlock[] {
  return dedupeGeneratedFiles(scanGeneratedFileBlocks(text));
}

function scanGeneratedFileBlocks(text: string): GeneratedFileBlock[] {
  const blocks: GeneratedFileBlock[] = [];
  FENCE_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(text)) !== null) {
    const info = match[1].trim();
    const parsed = parseFenceInfo(info);
    if (!parsed) continue;

    const contentStart = FENCE_RE.lastIndex;
    const close = text.indexOf('```', contentStart);
    const complete = close >= 0;
    const contentEnd = complete ? close : text.length;
    const endOffset = complete ? close + 3 : text.length;
    const rawContent = text.slice(contentStart, contentEnd).replace(/\r\n/g, '\n');
    const content = complete ? rawContent.replace(/\n$/, '') : rawContent;

    blocks.push({
      path: normalizeGeneratedPath(parsed.path),
      language: parsed.language,
      content,
      complete,
      startOffset: match.index,
      endOffset,
    });

    FENCE_RE.lastIndex = endOffset;
  }

  return blocks;
}

export function stripGeneratedFileBlocks(text: string): string {
  const blocks = scanGeneratedFileBlocks(text);
  if (!blocks.length) return text;
  let out = '';
  let cursor = 0;
  for (const block of [...blocks].sort((a, b) => a.startOffset - b.startOffset)) {
    out += text.slice(cursor, block.startOffset);
    cursor = block.endOffset;
  }
  out += text.slice(cursor);
  return out.replace(/\n{2,}/g, '\n').trim();
}

function parseFenceInfo(info: string): { path: string; language?: string } | null {
  if (!info) return null;
  const tokens = splitFenceInfo(info);
  if (!tokens.length) return null;

  const first = tokens[0].toLowerCase();
  if (first === 'file') {
    const path = readPathToken(tokens.slice(1), info.replace(/^file\s+/i, ''));
    return path ? { path, language: languageFromPath(path) } : null;
  }

  const pathAttr = tokens
    .map((t) => t.match(/^(?:path|file)=(.+)$/i)?.[1])
    .find(Boolean);
  if (pathAttr) {
    const path = unquote(pathAttr);
    return path ? { path, language: first || languageFromPath(path) } : null;
  }

  return null;
}

function splitFenceInfo(info: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|'([^']+)'|`([^`]+)`|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(info)) !== null) {
    out.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  }
  return out;
}

function readPathToken(tokens: string[], fallback: string): string | null {
  const attr = tokens
    .map((t) => t.match(/^(?:path|file)=(.+)$/i)?.[1])
    .find(Boolean);
  if (attr) return unquote(attr);
  if (tokens.length === 1) return unquote(tokens[0]);
  return unquote(fallback.trim());
}

function unquote(s: string | undefined): string | null {
  const value = (s ?? '').trim().replace(/^["'`]|["'`]$/g, '');
  if (!value || value.includes('\0')) return null;
  return value;
}

function normalizeGeneratedPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/{2,}/g, '/');
}

function dedupeGeneratedFiles(blocks: GeneratedFileBlock[]): GeneratedFileBlock[] {
  const byPath = new Map<string, GeneratedFileBlock>();
  for (const block of blocks) {
    if (!block.path || block.path.includes('..')) continue;
    byPath.set(block.path, block);
  }
  return [...byPath.values()];
}

function languageFromPath(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext || ext === path) return undefined;
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    rs: 'rust',
    php: 'php',
    py: 'python',
    css: 'css',
    html: 'html',
    md: 'markdown',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
  };
  return map[ext] ?? ext;
}

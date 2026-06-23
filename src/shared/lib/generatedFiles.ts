import type { ChatScope } from './chatContext';

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

export function normalizeGeneratedPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/{2,}/g, '/');
}

/** Map a model-generated path to a workspace-relative path for apply. */
export function resolveGeneratedApplyPath(filePath: string, scope: ChatScope): string {
  const path = normalizeGeneratedPath(filePath);
  if (scope.kind !== 'folder') return path;

  const folder = normalizeGeneratedPath(scope.path);
  if (!folder || folder === '.') return path;
  if (path === folder || path.startsWith(`${folder}/`)) return path;

  // Models often emit bare filenames when folder scope is active.
  if (!path.includes('/')) {
    return normalizeGeneratedPath(`${folder}/${path}`);
  }

  return path;
}

const CONTEXT_ARTIFACT_EXTENSIONS = new Set([
  'md',
  'mdx',
  'markdown',
  'txt',
  'rst',
  'adoc',
]);

const CONTEXT_ARTIFACT_NAME_RE =
  /(plan|notes?|context|readme|changelog|design|spec|architecture|todo|adr|rag|memory|summary|decision)/i;

/** Markdown / plan-style generated files that carry session context. */
export function isContextArtifactPath(path: string): boolean {
  const norm = normalizeGeneratedPath(path);
  const base = norm.split('/').pop() ?? norm;
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  if (CONTEXT_ARTIFACT_EXTENSIONS.has(ext)) return true;
  if (CONTEXT_ARTIFACT_NAME_RE.test(stem)) return true;
  if (CONTEXT_ARTIFACT_NAME_RE.test(norm)) return true;
  return false;
}

export function extractContextArtifacts(
  text: string,
  scope: ChatScope
): Array<{ path: string; content: string }> {
  return parseGeneratedFileBlocks(text)
    .filter((f) => f.complete && f.content.trim() && isContextArtifactPath(f.path))
    .map((f) => ({
      path: resolveGeneratedApplyPath(f.path, scope),
      content: f.content.trim(),
    }));
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

import { describe, expect, it } from 'vitest';
import {
  parseGeneratedFileBlocks,
  extractContextArtifacts,
  isContextArtifactPath,
  resolveGeneratedApplyPath,
  stripGeneratedFileBlocks,
} from './generatedFiles';

describe('parseGeneratedFileBlocks', () => {
  it('parses file fences', () => {
    const files = parseGeneratedFileBlocks(
      'Here:\n```file src/a.ts\nexport const a = 1;\n```\n```file src/b.ts\nexport const b = 2;\n```'
    );
    expect(files).toMatchObject([
      { path: 'src/a.ts', language: 'typescript', content: 'export const a = 1;', complete: true },
      { path: 'src/b.ts', language: 'typescript', content: 'export const b = 2;', complete: true },
    ]);
  });

  it('parses path attributes', () => {
    const files = parseGeneratedFileBlocks('```ts path=src/app.ts\nconsole.log(1)\n```');
    expect(files[0]).toMatchObject({
      path: 'src/app.ts',
      language: 'ts',
      content: 'console.log(1)',
    });
  });

  it('keeps incomplete blocks for streaming and reload recovery', () => {
    const files = parseGeneratedFileBlocks('```file src/open.rs\nfn main() {\n');
    expect(files[0]).toMatchObject({
      path: 'src/open.rs',
      complete: false,
      content: 'fn main() {\n',
    });
  });

  it('resolves bare filenames under folder scope', () => {
    expect(
      resolveGeneratedApplyPath('index.html', {
        kind: 'folder',
        path: 'test/qwentest',
        treeSummary: '',
        outlineSummary: '',
        files: [],
      })
    ).toBe('test/qwentest/index.html');
  });

  it('keeps workspace-relative paths when already prefixed', () => {
    expect(
      resolveGeneratedApplyPath('test/qwentest/index.html', {
        kind: 'folder',
        path: 'test/qwentest',
        treeSummary: '',
        outlineSummary: '',
        files: [],
      })
    ).toBe('test/qwentest/index.html');
  });

  it('detects contextual artifact paths', () => {
    expect(isContextArtifactPath('docs/PLAN.md')).toBe(true);
    expect(isContextArtifactPath('notes/context.txt')).toBe(true);
    expect(isContextArtifactPath('src/index.js')).toBe(false);
  });

  it('extracts context artifacts from assistant fences', () => {
    const artifacts = extractContextArtifacts(
      '```file docs/plan.md\n# Plan\nstep 1\n```\n```file src/a.ts\nx\n```',
      { kind: 'none' }
    );
    expect(artifacts).toEqual([{ path: 'docs/plan.md', content: '# Plan\nstep 1' }]);
  });

  it('strips generated file blocks from prose', () => {
    const text = 'Intro\n```file src/a.ts\nx\n```\nDone';
    expect(stripGeneratedFileBlocks(text)).toBe('Intro\nDone');
  });

  it('ignores file fences that only contain patch edits', () => {
    const files = parseGeneratedFileBlocks(
      '```file:vp/src/a.php\nedits:[{"old_text":"$a","new_text":"$b"}]\n```'
    );
    expect(files).toHaveLength(0);
  });

  it('ignores file fences with old_text/new_text labels (not full files)', () => {
    const files = parseGeneratedFileBlocks(
      '```file:vp/src/a.php\nold_text:\nforeach ($projectUids as $x) {\nnew_text:\nforeach ($projectUuids as $x) {\n```'
    );
    expect(files).toHaveLength(0);
  });

  it('parses file:path header without space', () => {
    const files = parseGeneratedFileBlocks('```file:src/a.ts\nexport const a = 1;\n```');
    expect(files[0]?.path).toBe('src/a.ts');
  });

  it('ignores whole php file fences (apply_patch handles edits)', () => {
    const body = '<?php\n' + 'line();\n'.repeat(40);
    const files = parseGeneratedFileBlocks(`\`\`\`file:vp/src/a.php\n${body}\`\`\``);
    expect(files).toHaveLength(0);
  });
});

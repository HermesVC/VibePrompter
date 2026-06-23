import { describe, expect, it } from 'vitest';
import { parseGeneratedFileBlocks, stripGeneratedFileBlocks } from './generatedFiles';

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

  it('strips generated file blocks from prose', () => {
    const text = 'Intro\n```file src/a.ts\nx\n```\nDone';
    expect(stripGeneratedFileBlocks(text)).toBe('Intro\nDone');
  });
});

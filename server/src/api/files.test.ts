import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHexRows, parseByteRange, previewTextLines } from './files.js';

test('render preview keeps long lines intact', () => {
  const longLine = `const DATA = ${'x'.repeat(13_000)};`;

  const sourceLines = previewTextLines(longLine);
  assert.match(sourceLines[0], /预览已截断/);

  const renderLines = previewTextLines(longLine, { truncateLongLines: false });
  assert.equal(renderLines[0], longLine);
});

test('hex preview formats offset, bytes and ascii columns', () => {
  const rows = formatHexRows(Buffer.from([0x00, 0x20, 0x41, 0x7e, 0x7f]), 16);
  assert.deepEqual(rows, [
    {
      offset: 16,
      hex: '00 20 41 7E 7F',
      ascii: '. A~.',
    },
  ]);
});

test('byte range parser supports browser media requests', () => {
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.equal(parseByteRange('bytes=100-', 100), 'invalid');
});

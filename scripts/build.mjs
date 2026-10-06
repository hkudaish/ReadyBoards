import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('src', 'dist', { recursive: true });
// Keep links to the original entry point working on the hosted site.
await writeFile('dist/ReadBoards.html', await readFile('src/index.html'));
console.log('Built ReadyBoards in dist/');

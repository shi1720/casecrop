import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
const files = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'python_stdlib.zip',
];
const destination = new URL('../public/runtime/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of files)
  await copyFile(
    new URL(`../node_modules/pyodide/${file}`, import.meta.url),
    new URL(file, destination),
  );

// Preserve upstream notices with the distributed browser assets. Include the
// installed build/test dependencies too; this is deliberately conservative.
const notices = [
  'CaseCrop dependency license notices\nGenerated from the installed, lockfile-pinned npm packages.\nSome packages are build/test tools and are not shipped as executable website code.\n',
];
async function collectPackages(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const location = new URL(`${entry.name}/`, directory);
    if (entry.name.startsWith('@')) {
      await collectPackages(location);
      continue;
    }
    const files = await readdir(location);
    if (!files.includes('package.json')) continue;
    const metadata = JSON.parse(
      await readFile(new URL('package.json', location), 'utf8'),
    );
    for (const file of files
      .filter((name) => /^(licen[cs]e|copying|ofl)(\.|$)/i.test(name))
      .sort()) {
      const path = new URL(file, location);
      try {
        notices.push(
          `\n===== ${metadata.name}@${metadata.version} / ${file} =====\n${await readFile(path, 'utf8')}`,
        );
      } catch (error) {
        if (error.code !== 'EISDIR') throw error;
      }
    }
    await collectPackages(new URL('node_modules/', location));
  }
}
await collectPackages(new URL('../node_modules/', import.meta.url));
notices.push(
  `\n===== Geist fonts / OFL =====\n${await readFile(new URL('../public/GEIST-OFL.txt', import.meta.url), 'utf8')}`,
);
await writeFile(
  new URL('THIRD_PARTY_LICENSES.txt', destination),
  notices.join('\n'),
  'utf8',
);
console.log(
  'Prepared the pinned local Python runtime and upstream license notices.',
);

import { loadPyodide } from 'pyodide';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const sources = JSON.parse(await readFile(new URL('../public/engine-sources.json', import.meta.url), 'utf8'));
const expected = JSON.parse(await readFile(new URL('../lib/examples.json', import.meta.url), 'utf8'));
const py = await loadPyodide();
py.FS.mkdirTree('/home/pyodide/casecrop');
for (const [name, source] of Object.entries(sources)) py.FS.writeFile(`/home/pyodide/casecrop/${name}`, source);
py.runPython('from casecrop.examples import browser_run');
for (const name of Object.keys(expected)) {
  py.globals.set('request_json', JSON.stringify({ case: name }));
  const actual = JSON.parse(py.runPython('browser_run(request_json)'));
  assert.deepEqual(actual, expected[name]);
  console.log(`${name}: browser Python matches the complete native report (${actual.reduced.events.length} events)`);
}
py.globals.set('request_json', JSON.stringify({ case: 'cache', max_calls: 1 }));
assert.equal(JSON.parse(py.runPython('browser_run(request_json)')).status, 'budget_exhausted');
py.globals.set('request_json', '{"trace":{}}');
assert.throws(() => py.runPython('browser_run(request_json)'));
console.log('Budget and malformed input paths verified in WebAssembly.');

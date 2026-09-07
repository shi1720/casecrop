import { loadPyodide } from '/runtime/pyodide.mjs';
let ready;
async function initialize() {
  const [py, response] = await Promise.all([loadPyodide({ indexURL: '/runtime/' }), fetch('/engine-sources.json')]);
  if (!response.ok) throw new Error('Could not load the CaseCrop engine. Please retry.');
  const sources = await response.json();
  py.FS.mkdirTree('/home/pyodide/casecrop');
  for (const [name, content] of Object.entries(sources)) {
    if (!/^[a-z_]+\.py$/.test(name)) throw new Error('Invalid engine bundle');
    py.FS.writeFile(`/home/pyodide/casecrop/${name}`, content);
  }
  py.runPython('from casecrop.examples import browser_run');
  return py;
}
self.onmessage = async ({ data }) => {
  try {
    ready ??= initialize();
    const py = await ready;
    py.globals.set('request_json', JSON.stringify(data.request));
    const rawReport = py.runPython('browser_run(request_json)');
    const result = JSON.parse(rawReport);
    self.postMessage({ id: data.id, result: { ...result, rawReport } });
  } catch (error) {
    ready = undefined;
    self.postMessage({ id: data.id, error: String(error?.message ?? error).split('\n').filter(Boolean).at(-1) });
  }
};

// Model code executes only inside a fresh QuickJS WASM guest. No host callbacks,
// module loader, network, filesystem or environment are installed in that guest.
import { parentPort, workerData } from 'node:worker_threads';
import { getQuickJS } from 'quickjs-emscripten';
const module = await getQuickJS();
const runtime = module.newRuntime();
runtime.setMemoryLimit(32 * 1024 * 1024);
runtime.setMaxStackSize(512 * 1024);
const deadline = performance.now() + 1500;
runtime.setInterruptHandler(() => performance.now() > deadline);
const context = runtime.newContext();
try {
  const result = context.evalCode(`(()=>{const value=(()=>{\n"use strict";\nconst input=${JSON.stringify(workerData.input ?? null)};\n${workerData.code}\n})();if(value && typeof value.then === "function") throw Error("Async calculations are unavailable");return JSON.stringify(value)})()`, 'ctf-calculation.js');
  if (result.error) {
    const dumped = context.dump(result.error); result.error.dispose();
    parentPort!.postMessage({ ok: false, error: dumped?.name === 'InternalError' ? 'compute_limit' : 'compute_error',
      detail: String(dumped?.message || 'Calculation failed').slice(0, 300) });
  } else {
    const output = context.getString(result.value); result.value.dispose();
    if (output.length > 12_000) parentPort!.postMessage({ ok: false, error: 'compute_output_limit' });
    else {
      try { parentPort!.postMessage({ ok: true, value: JSON.parse(output) }); }
      catch { parentPort!.postMessage({ ok: false, error: 'compute_non_json_result' }); }
    }
  }
} catch { parentPort!.postMessage({ ok: false, error: 'compute_failed' }); }
finally { context.dispose(); runtime.dispose(); }

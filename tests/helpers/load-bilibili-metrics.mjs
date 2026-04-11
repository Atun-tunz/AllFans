import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function loadBilibiliMetrics() {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'bilibili-metrics.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  const context = vm.createContext({
    console,
    globalThis: {}
  });
  context.globalThis = context;

  vm.runInContext(script, context, { filename: scriptPath });

  return context.AllFansBilibiliMetrics;
}

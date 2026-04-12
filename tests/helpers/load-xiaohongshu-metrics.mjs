import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function loadXiaohongshuMetrics() {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'xiaohongshu-metrics.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  const context = vm.createContext({
    console,
    URL,
    globalThis: {}
  });
  context.globalThis = context;

  vm.runInContext(script, context, { filename: scriptPath });

  return context.AllFansXiaohongshuMetrics;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('options page includes dashboard preview stage and export controls', () => {
  const htmlPath = path.join(process.cwd(), 'extension', 'options', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(html, /id="dashboardPreview"/);
  assert.match(html, /id="dashboardTitleInput"/);
  assert.match(html, /id="transparentBackgroundToggle"/);
  assert.match(html, /data-preset="landscape"/);
  assert.match(html, /data-preset="square"/);
  assert.match(html, /data-preset="story"/);
  assert.match(html, /data-export-format="png"/);
  assert.match(html, /data-export-format="jpg"/);
  assert.match(html, /data-export-format="svg"/);
  assert.match(html, /data-export-format="json"/);
  assert.match(html, /data-export-format="excel"/);
});

test('options script wires preview preset switching and dashboard export', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'options', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /import\s*\{[\s\S]*DEFAULT_DASHBOARD_TITLE[\s\S]*buildDashboardSnapshot[\s\S]*buildDashboardWorkbookXml[\s\S]*createDashboardSvg[\s\S]*getDashboardPresetById[\s\S]*\}\s*from '\.\/dashboard-export\.js';/m);
  assert.match(script, /document\.querySelectorAll\('\[data-preset\]'\)/);
  assert.match(script, /document\.querySelectorAll\('\[data-export-format\]'\)/);
  assert.match(script, /document\.getElementById\('dashboardTitleInput'\)/);
  assert.match(script, /document\.getElementById\('transparentBackgroundToggle'\)/);
  assert.match(script, /async function exportDashboard\(format\)/);
  assert.match(script, /renderDashboardPreview\(data\)/);
});

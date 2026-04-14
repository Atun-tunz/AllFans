import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('popup footer exposes both sync-all and clear-cache actions', () => {
  const htmlPath = path.join(process.cwd(), 'extension', 'popup', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(html, /id="clearCacheBtn"/);
  assert.match(html, /id="syncAllBtn"/);
  assert.ok(
    html.indexOf('id="syncAllBtn"') < html.indexOf('id="clearCacheBtn"'),
    'sync-all should appear before clear-cache in the footer'
  );
});

test('popup script binds the clear-cache action', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'popup', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /document\.getElementById\('clearCacheBtn'\)\?\.(addEventListener|addEventListener)\('click', clearCachedData\)/);
  assert.match(script, /MESSAGE_TYPES\.CLEAR_DATA/);
});

test('popup footer styles keep sync-all as the primary wide action', () => {
  const cssPath = path.join(process.cwd(), 'extension', 'popup', 'popup.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /\.actions-footer\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/);
  assert.match(css, /\.clear-cache-button\s*\{[\s\S]*padding:\s*12px 14px;/);
});

test('popup settings launch card does not render the old status summary copy', () => {
  const htmlPath = path.join(process.cwd(), 'extension', 'popup', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.doesNotMatch(html, /settingsLaunchSummary/);
});

test('popup no longer ships the removed inline settings panel implementation', () => {
  const htmlPath = path.join(process.cwd(), 'extension', 'popup', 'index.html');
  const scriptPath = path.join(process.cwd(), 'extension', 'popup', 'main.js');
  const appCssPath = path.join(process.cwd(), 'extension', 'popup', 'app.css');
  const animationsCssPath = path.join(process.cwd(), 'extension', 'popup', 'animations.css');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const script = fs.readFileSync(scriptPath, 'utf8');
  const appCss = fs.readFileSync(appCssPath, 'utf8');
  const animationsCss = fs.readFileSync(animationsCssPath, 'utf8');

  assert.doesNotMatch(html, /<html[^>]*style=/);
  assert.doesNotMatch(script, /renderSettingsLaunch/);
  assert.doesNotMatch(script, /settingsLaunchSummary/);
  assert.doesNotMatch(script, /window\.innerWidth\s*<\s*440/);
  assert.doesNotMatch(appCss, /\.settings-grid\b/);
  assert.doesNotMatch(appCss, /\.settings-panel-body\b/);
  assert.doesNotMatch(appCss, /\.setting-toggle\b/);
  assert.doesNotMatch(appCss, /\.platform-settings\b/);
  assert.doesNotMatch(appCss, /\.integration-status\b/);
  assert.doesNotMatch(appCss, /\.actions-wide\b/);
  assert.doesNotMatch(animationsCss, /\.settings-panel-bottom\b/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('xiaohongshu sync waits for the bridge script to be ready before requesting pages', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'xiaohongshu-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /script\.addEventListener\('load'/);
  assert.match(script, /await installBridgeScript\(\);/);
});

test('douyin sync reuses a valid captured work list snapshot before clearing it', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'douyin-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /hasReusableWorkListSnapshot/);
  assert.match(
    script,
    /if \(!metrics\.hasReusableWorkListSnapshot\(pendingSnapshot\)\) \{\s*pendingSnapshot = null;\s*\}/m
  );
});

test('xiaohongshu sync stops requesting extra pages once scanned works reach the known total', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'xiaohongshu-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /state\.total > 0 && state\.scannedItemCount >= state\.total/);
});

test('background open-and-sync flow can collapse to the default entrypoint for unified platforms', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'background', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /platform\.useOnlyDefaultSyncEntrypoint/);
});

test('background open-and-sync flow applies platform-specific wait options', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'background', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /function resolveOpenSyncOptions\(platform\)/);
  assert.match(script, /\.\.\.OPEN_SYNC_OPTIONS,[\s\S]*\.\.\.\(platform\?\.syncOptions \|\| \{\}\)/m);
  assert.match(script, /const openSyncOptions = resolveOpenSyncOptions\(platform\);/);
  assert.match(script, /waitForTabReady\(tab\.id,\s*entrypoint\.urlPrefix,\s*openSyncOptions\)/);
  assert.match(script, /sendMessageWithRetry\([\s\S]*openSyncOptions[\s\S]*\)/m);
});

test('kuaishou sync delegates usable-data decisions to the metrics module', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /metrics\.buildContentPlatformPatch/);
  assert.match(script, /metrics\.hasSufficientKuaishouData/);
});

test('kuaishou sync waits for the creator page to settle before requesting photo data', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /pageReadyTimeoutMs:\s*60000/);
  assert.match(script, /pageReadyIntervalMs:\s*1000/);
  assert.match(script, /settleDelayMs:\s*1500/);
  assert.match(script, /async function waitForKuaishouPageSettled/);
  assert.match(script, /await waitForKuaishouPageSettled\(\);[\s\S]*const state = await collectAllPhotoListData/);
});

test('kuaishou sync prefers the real page photo-list request before using the fallback URL', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /photoListRequestTimeoutMs:\s*60000/);
  assert.match(script, /function getKnownPhotoListUrls\(metrics\)/);
  assert.match(script, /async function waitForPhotoListRequestUrl\(metrics\)/);
  assert.match(script, /firstSnapshot\?\.url \|\| \(await waitForPhotoListRequestUrl\(metrics\)\) \|\| PHOTO_LIST_URL/);
});

test('kuaishou sync captures the page-context photo-list response before fallback fetching', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /BRIDGE_SOURCE = 'allfans-kuaishou-bridge'/);
  assert.match(script, /ALLFANS_KUAISHOU_PHOTO_LIST_RESPONSE/);
  assert.match(script, /function installBridgeScript\(\)/);
  assert.match(script, /runtime\.runtime\.getURL\('content\/kuaishou-bridge\.js'\)/);
  assert.match(script, /script\.addEventListener\('load'/);
  assert.match(script, /await installBridgeScript\(\);/);
  assert.match(script, /function bindBridgeListener\(metrics\)/);
  assert.match(script, /metrics\.hasReusablePhotoListSnapshot\(pendingSnapshot\)/);
});

test('kuaishou sync prepares the page bridge before DOMContentLoaded can miss signed account requests', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /function prepareKuaishouBridge\(\)/);
  assert.match(
    script,
    /prepareKuaishouBridge\(\)\.catch\([\s\S]*if \(document\.readyState === 'loading'\)/m
  );
});

test('kuaishou sync can run account-only on non-content creator pages', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /function getKuaishouPageRole\(\)/);
  assert.match(script, /return isManagePage\(\) \? 'content' : 'account'/);
  assert.match(
    script,
    /if \(pageRole === 'account'\) \{[\s\S]*return \{ data, scope: 'account' \};[\s\S]*\}/m
  );
});

test('kuaishou account collection waits for a captured signed home-info snapshot before fallback replay', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /async function waitForHomeInfoSnapshot\(metrics\)/);
  assert.match(
    script,
    /pendingAccountSnapshot = await waitForHomeInfoSnapshot\(metrics\) \|\| pendingAccountSnapshot/m
  );
});

test('kuaishou bridge is exposed as a web-accessible resource for page-context capture', () => {
  const manifestPath = path.join(process.cwd(), 'extension', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const resources = manifest.web_accessible_resources || [];

  assert.ok(
    resources.some(
      entry =>
        entry.resources?.includes('content/kuaishou-bridge.js') &&
        entry.matches?.includes('https://cp.kuaishou.com/*')
    )
  );
});

test('kuaishou bridge can replay photo-list requests from page context', () => {
  const bridgePath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-bridge.js');
  const bridge = fs.readFileSync(bridgePath, 'utf8');

  assert.match(bridge, /ALLFANS_KUAISHOU_FETCH_PAGE_REQUEST/);
  assert.match(bridge, /ALLFANS_KUAISHOU_FETCH_PAGE_RESPONSE/);
  assert.match(bridge, /latestPhotoListRequestTemplate/);
  assert.match(bridge, /window\.fetch\(url,\s*buildReplayInit\(latestPhotoListRequestTemplate\)\)/);
  assert.match(bridge, /XMLHttpRequest\.prototype\.setRequestHeader/);
});

test('kuaishou bridge captures and replays home info account requests', () => {
  const bridgePath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-bridge.js');
  const bridge = fs.readFileSync(bridgePath, 'utf8');

  assert.match(bridge, /ALLFANS_KUAISHOU_HOME_INFO_RESPONSE/);
  assert.match(bridge, /ALLFANS_KUAISHOU_FETCH_ACCOUNT_REQUEST/);
  assert.match(bridge, /ALLFANS_KUAISHOU_FETCH_ACCOUNT_RESPONSE/);
  assert.match(bridge, /latestAccountRequestTemplate/);
  assert.match(bridge, /\/rest\/cp\/creator\/pc\/home\/infoV2/);
  assert.match(bridge, /window\.fetch\(url,\s*buildReplayInit\(latestAccountRequestTemplate\)\)/);
});

test('kuaishou sync collects account data before content data and returns combined scope', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /let pendingAccountSnapshot = null/);
  assert.match(script, /function requestHomeInfoFromBridge\(\)/);
  assert.match(script, /async function collectAccountInfo\(metrics,\s*timestamp\)/);
  assert.match(
    script,
    /const accountPatch = await collectAccountInfo\(metrics,\s*timestamp\);[\s\S]*const state = await collectAllPhotoListData\(metrics\)/m
  );
  assert.match(script, /syncScope = syncScope === 'account' \? 'both' : 'content'/);
});

test('kuaishou sync keeps infoV2 account name ahead of content list names', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /const contentPatch = metrics\.buildContentPlatformPatch/);
  assert.match(
    script,
    /if \(!data\.displayName\) \{[\s\S]*Object\.assign\(data,\s*contentPatch\);[\s\S]*\} else \{[\s\S]*delete contentPatch\.displayName;[\s\S]*Object\.assign\(data,\s*contentPatch\);[\s\S]*\}/m
  );
});

test('kuaishou sync keeps account data when content refresh fails after account refresh', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'kuaishou-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /catch \(error\) \{[\s\S]*if \(syncScope === 'none'\) \{[\s\S]*throw error;[\s\S]*keeping account data/m);
});

test('background marks single-entrypoint platforms partial when returned scope misses expected scopes', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'background', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /function isPlatformScopeComplete\(platform,\s*scope\)/);
  assert.match(script, /status:\s*isPlatformScopeComplete\(platform,\s*response\.scope\) \? 'success' : 'partial'/);
});

test('background marks multi-entrypoint sync successful when the aggregated scope is complete', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'background', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /const aggregateScope = aggregateSyncScope\(successResults\);/);
  assert.match(script, /status:\s*isPlatformScopeComplete\(platform,\s*aggregateScope\) \? 'success' : 'partial'/);
});

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

test('douyin sync loads a web-accessible bridge script instead of inline page code', () => {
  const platformPath = path.join(process.cwd(), 'extension', 'platforms', 'douyin-platform.js');
  const platform = fs.readFileSync(platformPath, 'utf8');
  const syncPath = path.join(process.cwd(), 'extension', 'content', 'douyin-sync.js');
  const sync = fs.readFileSync(syncPath, 'utf8');
  const bridgePath = path.join(process.cwd(), 'extension', 'content', 'douyin-bridge.js');
  const bridge = fs.readFileSync(bridgePath, 'utf8');

  assert.match(platform, /resources:\s*\['content\/douyin-bridge\.js'\]/);
  assert.match(platform, /tabLoadTimeoutMs:\s*90000/);
  assert.match(sync, /runtime\.runtime\.getURL\('content\/douyin-bridge\.js'\)/);
  assert.match(sync, /timeoutMs:\s*60000/);
  assert.doesNotMatch(sync, /script\.textContent\s*=/);
  assert.match(bridge, /ALLFANS_DOUYIN_WORK_LIST_RESPONSE/);
  assert.match(bridge, /\/janus\/douyin\/creator\/pc\/work_list/);
  assert.match(bridge, /ALLFANS_DOUYIN_FETCH_PAGE_REQUEST/);
  assert.match(bridge, /ALLFANS_DOUYIN_FETCH_PAGE_RESPONSE/);
  assert.match(bridge, /latestWorkListRequestTemplate/);
  assert.match(sync, /function requestWorkListFromBridge\(url\)/);
  assert.match(sync, /requestWorkListFromBridge\(nextUrl\)/);
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
  assert.match(script, /waitForTabReady\(tab\.id,\s*matchesEntrypointUrl,\s*openSyncOptions\)/);
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
  assert.match(bridge, /requestWithTemplate/);
  assert.match(bridge, /window\.fetch\(url,\s*buildReplayInit\(template\)\)/);
  assert.match(bridge, /template:\s*latestPhotoListRequestTemplate/);
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
  assert.match(bridge, /template:\s*latestAccountRequestTemplate/);
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

test('weixin channels sync prefers clicking real SPA route links before pushState fallback', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /async function waitForRouteLink\(route\)/);
  assert.match(script, /await waitForRouteLink\(route\)/);
  assert.match(script, /routeLink\.click\(\)/);
  assert.match(script, /window\.history\.pushState/);
});

test('weixin channels sync can click visible content menu text when route links are unavailable', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /CONTENT_MENU_TEXT/);
  assert.match(script, /function findTextRouteCandidate\(entrypointId\)/);
  assert.match(script, /await waitForTextRouteCandidate\(entrypointId\)/);
  assert.match(script, /textRouteCandidate\.click\(\)/);
});

test('weixin channels sync keeps unclassified post-list captures under the requested content kind', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /let currentScanEntrypointId = null/);
  assert.match(script, /function getRequestedContentKindHint\(\)/);
  assert.match(script, /getContentKindForRole\(currentScanEntrypointId\)/);
  assert.match(script, /payload\.kind \|\| metrics\.getPostListKind\(payload\.url,\s*payload\.pageUrl\) \|\| getRequestedContentKindHint\(\)/);
});

test('weixin channels sync clears old post-list templates before each content entrypoint', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /BRIDGE_RESET_POST_LIST_TEMPLATES_REQUEST_TYPE/);
  assert.match(script, /function resetPostListTemplatesInBridge\(\)/);
  assert.match(script, /function shouldResetPostListTemplatesBeforeNavigation\(entrypointId\)/);
  assert.match(script, /if \(shouldResetPostListTemplatesBeforeNavigation\(requestedEntrypointId\)\) \{[\s\S]*await resetPostListTemplatesInBridge\(\);[\s\S]*\}/m);
  assert.match(script, /await navigateToRequestedEntrypoint\(requestedEntrypointId\)/);
});

test('weixin channels sync paginates post-list data until the requested content kind is complete', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /maxPages:\s*\d+/);
  assert.match(script, /async function collectAllPostListData\(metrics,\s*kind\)/);
  assert.match(script, /while \(pageCount < WAIT_OPTIONS\.maxPages\)/);
  assert.match(script, /metrics\.isPostListKindScanComplete\(state,\s*kind\)/);
  assert.match(script, /metrics\.buildNextPostListPageRequest\(/);
  assert.match(script, /requestPostListFromBridge\(kind,\s*pageRequest\)/);
});

test('weixin channels sync collects video and image-text content in one default entrypoint run', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /function getContentKindsForRole\(role\)/);
  assert.match(script, /function getRoleForContentKind\(kind\)/);
  assert.match(script, /for \(const contentKindToCollect of contentKinds\)/);
  assert.match(script, /currentScanEntrypointId = contentEntrypointId/);
  assert.match(script, /await navigateToRequestedEntrypoint\(contentEntrypointId\)/);
  assert.match(script, /collectContentInfo\(metrics,\s*contentKindToCollect,\s*timestamp\)/);
});

test('weixin channels sync relays post-list bridge requests through child frames', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /function postBridgeMessage\(message,\s*\{ includeChildFrames = false \} = \{\}\)/);
  assert.match(script, /document\.querySelectorAll\('iframe'\)/);
  assert.match(script, /frame\.contentWindow\.postMessage\(message,\s*'\*'\)/);
  assert.match(
    script,
    /postBridgeMessage\(\s*\{[\s\S]*type: BRIDGE_POST_LIST_FETCH_REQUEST_TYPE[\s\S]*allowMissingTemplate: true[\s\S]*\},\s*\{ includeChildFrames: true \}/m
  );
});

test('weixin channels bridge forwards child-frame captures to the top frame', () => {
  const bridgePath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-bridge.js');
  const bridge = fs.readFileSync(bridgePath, 'utf8');

  assert.match(bridge, /function postBridgeMessage\(message\)/);
  assert.match(bridge, /window\.top && window\.top !== window/);
  assert.match(bridge, /window\.top\.postMessage\(payload,\s*'\*'\)/);
  assert.match(bridge, /payload\?\.source !== SOURCE/);
  assert.doesNotMatch(bridge, /event\.source !== window \|\| payload\?\.source !== SOURCE/);
  assert.match(bridge, /payload\.allowMissingTemplate/);
});

test('weixin channels sync does not reuse passive account scans for manual content entrypoints', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /let activeScanKey = null/);
  assert.match(script, /const scanKey = `\$\{reason\}:\$\{entrypointId \|\| 'auto'\}`/);
  assert.match(script, /if \(activeScanPromise && activeScanKey === scanKey\)/);
  assert.match(script, /function hasRequestedEntrypointParam\(\)/);
  assert.match(script, /if \(hasRequestedEntrypointParam\(\)\) \{[\s\S]*return;[\s\S]*\}/m);
});

test('weixin channels bridge can replay unclassified post-list templates for the requested kind', () => {
  const bridgePath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-bridge.js');
  const bridge = fs.readFileSync(bridgePath, 'utf8');

  assert.match(bridge, /RESET_POST_LIST_TEMPLATES_REQUEST_TYPE/);
  assert.match(bridge, /function resetPostListTemplates\(\)/);
  assert.match(bridge, /unclassified:\s*null/);
  assert.match(bridge, /latestPostListRequestTemplates\.unclassified = template/);
  assert.match(bridge, /latestPostListRequestTemplates\[kind\] \|\| latestPostListRequestTemplates\.unclassified/);
});

test('weixin channels bridge applies pagination overrides when replaying post-list templates', () => {
  const bridgePath = path.join(process.cwd(), 'extension', 'content', 'weixin-channels-bridge.js');
  const bridge = fs.readFileSync(bridgePath, 'utf8');

  assert.match(bridge, /function applyPostListPagination\(template,\s*pageRequest\)/);
  assert.match(bridge, /pageRequest\.offset/);
  assert.match(bridge, /pageRequest\.cursor/);
  assert.match(bridge, /buildReplayInit\(paginatedTemplate\)/);
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

test('background starts sync-all as a pollable job instead of holding the popup message open', () => {
  const messagesPath = path.join(process.cwd(), 'extension', 'runtime', 'messages.js');
  const messages = fs.readFileSync(messagesPath, 'utf8');
  const scriptPath = path.join(process.cwd(), 'extension', 'background', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(messages, /GET_SYNC_ALL_STATUS/);
  assert.match(script, /function startSyncAllEnabledPlatformsJob\(reason\)/);
  assert.match(script, /sendResponse\(\{\s*success:\s*true,\s*data:\s*getSyncAllJobSnapshot\(job\)\s*\}\)/);
  assert.match(script, /syncAllEnabledPlatforms\(reason\)\s*\.\s*then/);
  assert.match(script, /case MESSAGE_TYPES\.GET_SYNC_ALL_STATUS/);
});

test('background sync-all opens reusable background tabs without stealing popup focus', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'background', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /function openOrActivateTargetTab\(targetUrl,\s*matchesUrl,\s*\{\s*active = true\s*\} = \{\}\)/);
  assert.match(script, /BrowserApi\.tabs\.query\(\{\}\)/);
  assert.match(script, /if \(active\) \{[\s\S]*BrowserApi\.tabs\.update\(existingTab\.id,\s*\{\s*active:\s*true\s*\}\)/m);
  assert.match(script, /BrowserApi\.tabs\.create\(\{[\s\S]*active[\s\S]*\}\)/m);
  assert.match(script, /openInBackground:\s*true/);
  assert.match(script, /active:\s*!openInBackground/);
});

test('weibo sync opens explicit video and article manager pages for content capture', () => {
  const platformPath = path.join(process.cwd(), 'extension', 'platforms', 'weibo-platform.js');
  const platform = fs.readFileSync(platformPath, 'utf8');
  const backgroundPath = path.join(process.cwd(), 'extension', 'background', 'main.js');
  const background = fs.readFileSync(backgroundPath, 'utf8');
  const syncPath = path.join(process.cwd(), 'extension', 'content', 'weibo-sync.js');
  const sync = fs.readFileSync(syncPath, 'utf8');

  assert.match(platform, /expectedSyncScopes:\s*\['account', 'content'\]/);
  assert.match(platform, /url:\s*'https:\/\/weibo\.com\/'/);
  assert.match(platform, /https:\/\/www\.weibo\.com\/\*/);
  assert.match(platform, /id:\s*'videoContent'/);
  assert.match(platform, /https:\/\/me\.weibo\.com\/content\/video/);
  assert.match(platform, /id:\s*'articleContent'/);
  assert.match(platform, /https:\/\/me\.weibo\.com\/content\/article/);
  assert.match(platform, /contentStatsLastUpdate/);
  assert.match(sync, /GET_ACCOUNT_PROFILE_URL/);
  assert.match(sync, /function isWeiboAccountHost\(hostname\)/);
  assert.match(sync, /function isWeiboProfileUrl\(url\)/);
  assert.match(sync, /function readProfileUrlFromGlobals\(\)/);
  assert.match(sync, /function readProfileUrlFromInlineConfig\(\)/);
  assert.match(sync, /profile_url/);
  assert.match(sync, /document\.querySelectorAll\('script'\)/);
  assert.match(sync, /function resolveCurrentProfileUrl\(\)/);
  assert.doesNotMatch(sync, /document\.querySelectorAll\('a\[href\]'\)/);
  assert.doesNotMatch(background, /target\.pathname === '\/profile'/);
  assert.match(sync, /hostname === 'weibo\.com' \|\| hostname === 'www\.weibo\.com'/);
  assert.match(background, /platform\?\.matchesActiveTab\?\.\(url\)\?\.entrypointId === entrypoint\?\.id/);
  assert.match(background, /GET_ACCOUNT_PROFILE_URL/);
  assert.match(background, /function readWeiboAccountProfileUrlOnce/);
  assert.match(background, /weiboProfileSettleDelayMs \|\| 8000/);
  assert.doesNotMatch(background, /while \(Date\.now\(\) - startedAt/);
  assert.match(background, /function ensureWeiboAccountProfilePage/);
  assert.match(background, /BrowserApi\.tabs\.update\(tabId,\s*\{\s*url:\s*profileUrl\s*\}\)/);
  assert.match(background, /BrowserApi\.tabs\.reload\(tab\.id\);[\s\S]*waitForTabReady\(tab\.id,\s*matchesEntrypointUrl,\s*openSyncOptions\)/m);
  assert.match(sync, /function getContentKindsForRole\(role\)/);
  assert.match(sync, /videoContent/);
  assert.match(sync, /articleContent/);
});

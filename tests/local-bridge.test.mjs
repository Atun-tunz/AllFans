import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultData } from '../extension/utils/data-model.mjs';
import {
  buildLocalBridgeSnapshot,
  pushSnapshotToLocalBridge
} from '../extension/runtime/local-bridge.js';

test('buildLocalBridgeSnapshot includes stable fields for local consumers', () => {
  const data = createDefaultData();
  data.platforms.bilibili.fans = 5306;
  data.summary.totalFans = 5306;

  const snapshot = buildLocalBridgeSnapshot({
    data,
    syncResults: [
      {
        platformId: 'bilibili',
        success: true,
        reason: 'manual'
      }
    ]
  });

  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(typeof snapshot.timestamp, 'string');
  assert.equal(snapshot.summary.totalFans, 5306);
  assert.equal(snapshot.platforms.bilibili.fans, 5306);
  assert.deepEqual(snapshot.syncResults, [
    {
      platformId: 'bilibili',
      success: true,
      reason: 'manual'
    }
  ]);
});

test('pushSnapshotToLocalBridge skips requests when local bridge is disabled', async () => {
  let called = false;

  const result = await pushSnapshotToLocalBridge({
    settings: {
      localBridgeEnabled: false,
      localBridgeEndpoint: 'http://127.0.0.1:8765'
    },
    data: createDefaultData(),
    syncResults: [],
    fetchImpl: async () => {
      called = true;
      return new Response(null, { status: 204 });
    }
  });

  assert.equal(called, false);
  assert.equal(result.status, 'disabled');
});

test('pushSnapshotToLocalBridge posts the latest snapshot to localhost', async () => {
  const data = createDefaultData();
  data.platforms.douyin.fans = 2026;

  let requestUrl = null;
  let requestBody = null;

  const result = await pushSnapshotToLocalBridge({
    settings: {
      localBridgeEnabled: true,
      localBridgeEndpoint: 'http://127.0.0.1:8765'
    },
    data,
    syncResults: [{ platformId: 'douyin', success: true }],
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  assert.equal(requestUrl, 'http://127.0.0.1:8765');
  assert.equal(requestBody.platforms.douyin.fans, 2026);
  assert.equal(result.status, 'success');
});

test('pushSnapshotToLocalBridge returns an error result when localhost is unreachable', async () => {
  const result = await pushSnapshotToLocalBridge({
    settings: {
      localBridgeEnabled: true,
      localBridgeEndpoint: 'http://127.0.0.1:8765'
    },
    data: createDefaultData(),
    syncResults: [],
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED');
    }
  });

  assert.equal(result.status, 'error');
  assert.match(result.error, /ECONNREFUSED/);
});

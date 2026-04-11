import {
  calculateSummary,
  createDefaultData,
  mergePlatformData,
  normalizeSettings,
  normalizeStoredData
} from '../utils/data-model.mjs';
import { BrowserApi } from './browser-api.js';

export class StorageManager {
  static async getAllData() {
    const result = await BrowserApi.storage.local.get(null);
    if (!result || Object.keys(result).length === 0) {
      return createDefaultData();
    }

    return normalizeStoredData(result);
  }

  static async getPlatformData(platformId) {
    const data = await this.getAllData();
    return data.platforms[platformId] || null;
  }

  static async updatePlatformData(platformId, platformData) {
    const data = await this.getAllData();
    const timestamp = new Date().toISOString();

    data.platforms[platformId] = mergePlatformData(
      data.platforms[platformId],
      platformData,
      timestamp
    );
    data.summary = calculateSummary(data.platforms, data.settings);

    await BrowserApi.storage.local.set(data);
    return data;
  }

  static async updateSettings(settings) {
    const data = await this.getAllData();
    data.settings = normalizeSettings({ ...data.settings, ...settings });
    data.summary = calculateSummary(data.platforms, data.settings);
    await BrowserApi.storage.local.set(data);
    return data;
  }

  static async updateLocalBridgeState(nextState) {
    const data = await this.getAllData();
    data.integrations.localBridge = {
      ...data.integrations.localBridge,
      ...nextState
    };
    await BrowserApi.storage.local.set(data);
    return data;
  }

  static async clearAllData() {
    await BrowserApi.storage.local.clear();
    await BrowserApi.storage.local.set(createDefaultData());
  }
}

import { supabase } from './supabase';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppConfig {
  minAppVersion: string;
  minVersionCode: number;
  minBuildNumber: number;
  forceUpdate: boolean;
  updateMessage: string;
  updateMessageAr?: string;
  updateMessageKu?: string;
  androidStoreUrl: string;
  iosStoreUrl: string;
  // Newest released build — drives the SOFT (dismissible) "update available" notice.
  latestVersionCode: number;
  latestBuildNumber: number;
  softUpdateMessage?: string;
  softUpdateMessageAr?: string;
  softUpdateMessageKu?: string;
}

export type UpdateMode = 'force' | 'soft' | 'none';

interface CachedAppConfig {
  config: AppConfig;
  timestamp: number;
}

interface CheckForUpdateResult {
  needsUpdate: boolean;
  isCritical: boolean;
  reason: 'force-update-version-block' | 'no-update-required';
  config: AppConfig;
}

const DEFAULT_CONFIG: AppConfig = {
  minAppVersion: '1.2.2',
  minVersionCode: 26,
  minBuildNumber: 1,
  forceUpdate: false,
  updateMessage: 'A critical update is required to continue using Asankary. Please update to the latest version.',
  updateMessageAr: 'يتطلب الأمر تحديثًا إلزاميًا لمتابعة استخدام تطبيق Asankary. يرجى التحديث إلى أحدث إصدار.',
  updateMessageKu: 'پێویستە نوێکردنەوەیەکی گرنگ ئەنجام بدەیت بۆ بەردەوامبوون لە بەکارهێنانی Asankary. تکایە بۆ دوا وەشان نوێی بکەرەوە.',
  androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.asankary.app',
  // id6794673336 is Asankary. The id here used to be 6759567908, which is
  // HARYAD AUTOPARTS (bundle com.haryad.autopart) — fork residue that survived
  // because the slug says "asankary", so it reads correct at a glance. Every iOS
  // customer who tapped Update was sent to a different company's app.
  //
  // Verified against Apple's own lookup API:
  //   id6794673336 -> Asankary,          com.asankary.app
  //   id6759567908 -> Haryad Autoparts,  com.haryad.autopart
  //
  // This default also SEEDS the app_config row on a fresh install, so a wrong
  // value here propagates into the database and outlives the code fix.
  iosStoreUrl: 'https://apps.apple.com/app/asankary/id6794673336',
  latestVersionCode: 26,
  latestBuildNumber: 1,
};

class AppConfigService {
  private static readonly DOCUMENT = 'app';
  private static readonly CACHE_KEY = 'app_config_cache_v2';
  private static readonly CACHE_EXPIRY_MS = 60 * 60 * 1000;

  private async getCachedConfig(): Promise<AppConfig | null> {
    try {
      const raw = await AsyncStorage.getItem(AppConfigService.CACHE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as CachedAppConfig;
      if (!parsed?.config || !parsed?.timestamp) return null;

      const isFresh = Date.now() - parsed.timestamp < AppConfigService.CACHE_EXPIRY_MS;
      return isFresh ? parsed.config : null;
    } catch {
      return null;
    }
  }

  private async getStaleCachedConfig(): Promise<AppConfig | null> {
    try {
      const raw = await AsyncStorage.getItem(AppConfigService.CACHE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as CachedAppConfig;
      return parsed?.config ?? null;
    } catch {
      return null;
    }
  }

  private async setCachedConfig(config: AppConfig): Promise<void> {
    try {
      const payload: CachedAppConfig = { config, timestamp: Date.now() };
      await AsyncStorage.setItem(AppConfigService.CACHE_KEY, JSON.stringify(payload));
    } catch {}
  }

  private normalizeConfig(data?: Partial<AppConfig> | null): AppConfig {
    return {
      ...DEFAULT_CONFIG,
      ...(data ?? {}),
      minAppVersion: String(data?.minAppVersion ?? DEFAULT_CONFIG.minAppVersion),
      minVersionCode: Number(data?.minVersionCode ?? DEFAULT_CONFIG.minVersionCode),
      minBuildNumber: Number(data?.minBuildNumber ?? DEFAULT_CONFIG.minBuildNumber),
      forceUpdate: Boolean(data?.forceUpdate ?? DEFAULT_CONFIG.forceUpdate),
      updateMessage: String(data?.updateMessage ?? DEFAULT_CONFIG.updateMessage),
      updateMessageAr: typeof data?.updateMessageAr === 'string' ? data.updateMessageAr : DEFAULT_CONFIG.updateMessageAr,
      updateMessageKu: typeof data?.updateMessageKu === 'string' ? data.updateMessageKu : DEFAULT_CONFIG.updateMessageKu,
      androidStoreUrl: String(data?.androidStoreUrl ?? DEFAULT_CONFIG.androidStoreUrl),
      iosStoreUrl: String(data?.iosStoreUrl ?? DEFAULT_CONFIG.iosStoreUrl),
      latestVersionCode: Number(data?.latestVersionCode ?? data?.minVersionCode ?? DEFAULT_CONFIG.latestVersionCode),
      latestBuildNumber: Number(data?.latestBuildNumber ?? data?.minBuildNumber ?? DEFAULT_CONFIG.latestBuildNumber),
      softUpdateMessage: typeof data?.softUpdateMessage === 'string' ? data.softUpdateMessage : undefined,
      softUpdateMessageAr: typeof data?.softUpdateMessageAr === 'string' ? data.softUpdateMessageAr : undefined,
      softUpdateMessageKu: typeof data?.softUpdateMessageKu === 'string' ? data.softUpdateMessageKu : undefined,
    };
  }

  async getAppConfig(forceRefresh = false): Promise<AppConfig> {
    try {
      if (!forceRefresh) {
        const cached = await this.getCachedConfig();
        if (cached) return cached;
      }

      const { data, error } = await supabase.from('app_config').select('data').eq('id', AppConfigService.DOCUMENT).single();

      const config = data ? this.normalizeConfig(data.data as Partial<AppConfig>) : DEFAULT_CONFIG;
      await this.setCachedConfig(config);
      return config;
    } catch (error) {
      console.error('Error fetching app config:', error);
      const staleCache = await this.getStaleCachedConfig();
      if (staleCache) return staleCache;
      return DEFAULT_CONFIG;
    }
  }

  async syncVersionToFirestore(): Promise<void> {
    try {
      const currentVersion = this.getCurrentVersion();
      const currentCode = this.getCurrentVersionCode();

      const { data, error } = await supabase.from('app_config').select('data').eq('id', AppConfigService.DOCUMENT).single();

      if (!data) {
        await supabase.from('app_config').insert({
          id: AppConfigService.DOCUMENT,
          data: {
            ...DEFAULT_CONFIG,
            minAppVersion: currentVersion,
            minVersionCode: Platform.OS === 'android' ? currentCode : DEFAULT_CONFIG.minVersionCode,
            minBuildNumber: Platform.OS === 'ios' ? currentCode : DEFAULT_CONFIG.minBuildNumber,
            latestVersionCode: Platform.OS === 'android' ? currentCode : DEFAULT_CONFIG.latestVersionCode,
            latestBuildNumber: Platform.OS === 'ios' ? currentCode : DEFAULT_CONFIG.latestBuildNumber,
          }
        });
        return;
      }

      const configData = data.data as Partial<AppConfig>;
      const storedVersion = String(configData?.minAppVersion ?? '1.0.0');
      const storedVersionCode = Number(configData?.minVersionCode ?? 1);
      const storedBuildNumber = Number(configData?.minBuildNumber ?? 1);

      const storedLatestCode = Number(configData?.latestVersionCode ?? storedVersionCode);
      const storedLatestBuild = Number(configData?.latestBuildNumber ?? storedBuildNumber);

      const isNewerVersion = this.compareVersions(currentVersion, storedVersion) > 0;
      const isNewerCode = Platform.OS === 'android' && currentCode > storedVersionCode;
      const isNewerBuild = Platform.OS === 'ios' && currentCode > storedBuildNumber;
      const isNewerLatest = Platform.OS === 'android' ? currentCode > storedLatestCode : currentCode > storedLatestBuild;

      if (isNewerVersion || isNewerCode || isNewerBuild || isNewerLatest) {
        const update: Record<string, any> = { minAppVersion: currentVersion };
        if (Platform.OS === 'android') {
          update.minVersionCode = currentCode;
          update.latestVersionCode = currentCode;   // soft "update available" marker
        } else {
          update.minBuildNumber = currentCode;
          update.latestBuildNumber = currentCode;
        }

        await supabase.from('app_config').update({ data: { ...configData, ...update }, updated_at: new Date().toISOString() }).eq('id', AppConfigService.DOCUMENT);
        await AsyncStorage.removeItem(AppConfigService.CACHE_KEY);
      }
    } catch (error) {
      console.warn('Auto-sync version to Supabase failed (non-critical):', error);
    }
  }

  async enableCriticalUpdate(minAppVersion: string, minVersionCode: number): Promise<void> {
    try {
      const { data } = await supabase.from('app_config').select('data').eq('id', AppConfigService.DOCUMENT).single();
      const configData = data ? (data.data as Partial<AppConfig>) : {};

      await supabase.from('app_config').upsert({
        id: AppConfigService.DOCUMENT,
        data: { ...configData, minAppVersion, minVersionCode, forceUpdate: true },
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (error) {
      console.error('Error enabling critical update:', error);
      throw error;
    }
  }

  async disableCriticalUpdate(): Promise<void> {
    try {
      const { data } = await supabase.from('app_config').select('data').eq('id', AppConfigService.DOCUMENT).single();
      const configData = data ? (data.data as Partial<AppConfig>) : {};

      await supabase.from('app_config').upsert({
        id: AppConfigService.DOCUMENT,
        data: { ...configData, forceUpdate: false },
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (error) {
      console.error('Error disabling critical update:', error);
      throw error;
    }
  }

  getCurrentVersion(): string {
    // Prefer the ACTUAL installed binary's version (expo-application reads it from
    // the OS). Constants.expoConfig can be null in a prebuilt/standalone build,
    // which previously made this fall back to 1.0.0 and break the update check.
    return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  }

  getCurrentVersionCode(): number {
    // nativeBuildVersion = Android versionCode / iOS build number, read from the
    // installed app — the source of truth regardless of how the config embeds.
    const native = Application.nativeBuildVersion;
    const parsedNative = native != null ? Number.parseInt(String(native), 10) : NaN;
    if (!Number.isNaN(parsedNative) && parsedNative > 0) return parsedNative;

    // Fallback to the embedded config if the native value isn't available.
    if (Platform.OS === 'android') {
      return Constants.expoConfig?.android?.versionCode ?? 1;
    }
    const iosBuildNumber = Constants.expoConfig?.ios?.buildNumber ?? '1';
    const parsed = Number.parseInt(iosBuildNumber, 10);
    return Number.isNaN(parsed) ? 1 : parsed;
  }

  compareVersions(current: string, required: string): number {
    const currentParts = current.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const requiredParts = required.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const length = Math.max(currentParts.length, requiredParts.length);

    for (let i = 0; i < length; i += 1) {
      const currentPart = currentParts[i] ?? 0;
      const requiredPart = requiredParts[i] ?? 0;
      if (currentPart < requiredPart) return -1;
      if (currentPart > requiredPart) return 1;
    }
    return 0;
  }

  async checkForUpdate(): Promise<CheckForUpdateResult> {
    const config = await this.getAppConfig();
    if (!config.forceUpdate) {
      return { needsUpdate: false, isCritical: false, reason: 'no-update-required', config };
    }
    const currentVersion = this.getCurrentVersion();
    const currentVersionCode = this.getCurrentVersionCode();
    const minCode = Platform.OS === 'ios' ? config.minBuildNumber : config.minVersionCode;
    const belowMinCode = currentVersionCode < minCode;
    const belowMinVersion = this.compareVersions(currentVersion, config.minAppVersion) < 0;

    if (belowMinCode || belowMinVersion) {
      return { needsUpdate: true, isCritical: true, reason: 'force-update-version-block', config };
    }
    return { needsUpdate: false, isCritical: false, reason: 'no-update-required', config };
  }

  // Decide what to show: a blocking FORCE update, a dismissible SOFT "update available", or nothing.
  async evaluateUpdate(forceRefresh = false): Promise<{ mode: UpdateMode; config: AppConfig }> {
    const config = await this.getAppConfig(forceRefresh);
    const currentCode = this.getCurrentVersionCode();
    const currentVersion = this.getCurrentVersion();
    const minCode = Platform.OS === 'ios' ? config.minBuildNumber : config.minVersionCode;
    const latestCode = Platform.OS === 'ios' ? config.latestBuildNumber : config.latestVersionCode;

    // FORCE: explicitly flagged AND this build is below the required minimum
    if (config.forceUpdate && (currentCode < minCode || this.compareVersions(currentVersion, config.minAppVersion) < 0)) {
      return { mode: 'force', config };
    }
    // SOFT: a newer build exists than the one running
    if (currentCode < latestCode) {
      return { mode: 'soft', config };
    }
    return { mode: 'none', config };
  }

  // Remember when a soft notice was dismissed for a given "latest" code, so we don't nag
  // on every launch — but we DO prompt again the next time you ship a newer build.
  private static readonly SOFT_DISMISS_KEY = 'soft_update_dismissed_code';
  async wasSoftDismissed(latestCode: number): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(AppConfigService.SOFT_DISMISS_KEY);
      return raw != null && Number(raw) >= latestCode;
    } catch { return false; }
  }
  async markSoftDismissed(latestCode: number): Promise<void> {
    try { await AsyncStorage.setItem(AppConfigService.SOFT_DISMISS_KEY, String(latestCode)); } catch {}
  }

  getLocalizedSoftMessage(config: AppConfig, language?: string): string {
    const lang = (language ?? '').toLowerCase();
    if (lang.startsWith('ar') && config.softUpdateMessageAr?.trim()) return config.softUpdateMessageAr;
    if ((lang.startsWith('ku') || lang.startsWith('ckb')) && config.softUpdateMessageKu?.trim()) return config.softUpdateMessageKu;
    return config.softUpdateMessage?.trim() || '';
  }

  getLocalizedUpdateMessage(config: AppConfig, language?: string): string {
    const lang = (language ?? '').toLowerCase();
    if (lang.startsWith('ar') && config.updateMessageAr?.trim()) return config.updateMessageAr;
    if ((lang.startsWith('ku') || lang.startsWith('ckb')) && config.updateMessageKu?.trim()) return config.updateMessageKu;
    return config.updateMessage || DEFAULT_CONFIG.updateMessage;
  }

  getStoreUrl(config: AppConfig): string {
    return Platform.OS === 'ios' ? config.iosStoreUrl : config.androidStoreUrl;
  }

  async openStore(config: AppConfig): Promise<void> {
    const storeUrl = this.getStoreUrl(config);
    try {
      const supported = await Linking.canOpenURL(storeUrl);
      if (!supported) throw new Error(`Cannot open store URL: ${storeUrl}`);
      await Linking.openURL(storeUrl);
    } catch (error) {
      console.error('Error opening store:', error);
      throw error;
    }
  }
}

export const appConfigService = new AppConfigService();
export default appConfigService;
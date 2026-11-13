import { createSetting } from '@basalt/core';
import Listener from '../../modules/pulse-listener';
import type { PulseRule } from './rules';

export const rulesSetting = createSetting<PulseRule[]>('pulse.rules', []);
export const digestTimesSetting = createSetting<number[]>('pulse.digestTimes', [8 * 60, 13 * 60, 20 * 60]);
export const codesSetting = createSetting<boolean>('pulse.codes', true);
export const ongoingSetting = createSetting<boolean>('pulse.includeOngoing', false);
export const retentionSetting = createSetting<number>('pulse.retentionDays', 30);
export const lockSetting = createSetting<boolean>('pulse.lock', false);

export const UPDATE_SOURCE = { owner: 'muhammadahmad545-code', repo: 'pulse' } as const;
export const REPO_URL = `https://github.com/${UPDATE_SOURCE.owner}/${UPDATE_SOURCE.repo}`;
export const ACCENT = { dark: '#FF8A65', light: '#C2410C', onAccent: '#1F0A03' } as const;

/** Push every setting the listener service reads. It runs without the JS side, so it keeps its own copy. */
export function syncNative(): string | null {
  try {
    Listener.setRules(JSON.stringify(rulesSetting.get()));
    Listener.setDigestTimes(JSON.stringify(digestTimesSetting.get()));
    Listener.setOptions(codesSetting.get(), ongoingSetting.get(), retentionSetting.get());
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not update the notification listener.';
  }
}

export { Listener };

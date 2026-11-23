import { Button, Card, Chip, Header, IconButton, Screen, SectionTitle, SegmentedControl, Text, TextField, useTheme, useToast } from '@basalt/core';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Trash2 from 'lucide-react-native/icons/trash';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import type { AppSummary, CapturedNotification } from '../../../modules/pulse-listener';
import { ACTION_INFO, matchRule, parseKeywords, validateRule } from '../../lib/rules';
import type { PulseRule, RuleAction } from '../../lib/rules';
import { Listener, rulesSetting, syncNative } from '../../lib/settings';

export default function RuleEditor() {
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string; pkg?: string; app?: string }>();
  const [rules, setRules] = rulesSetting.use();
  const existing = rules.find((r) => r.id === params.id);
  const [draft, setDraft] = useState<PulseRule>(
    () =>
      existing ?? {
        id: Crypto.randomUUID(),
        name: params.app ? `Quiet ${params.app}` : '',
        enabled: true,
        apps: params.pkg ? [params.pkg] : [],
        keywords: [],
        action: 'mute',
      },
  );
  const [keywordText, setKeywordText] = useState(draft.keywords.join(', '));
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [recent, setRecent] = useState<CapturedNotification[]>([]);

  useEffect(() => {
    Listener.apps().then(setApps).catch(() => {});
    Listener.query(null, null, null, null, null, 300).then(setRecent).catch(() => {});
  }, []);

  const candidate = useMemo(() => ({ ...draft, keywords: parseKeywords(keywordText), enabled: true }), [draft, keywordText]);
  // Preview: how many of the last 300 notifications this rule would have caught.
  const preview = useMemo(() => recent.filter((n) => matchRule([candidate], n.package, n.title, n.text)).length, [recent, candidate]);

  const save = () => {
    const error = validateRule(candidate);
    if (error) return toast(error, 'danger');
    const final = { ...candidate, enabled: existing?.enabled ?? true };
    setRules(existing ? rules.map((r) => (r.id === final.id ? final : r)) : [...rules, final]);
    const syncError = syncNative();
    if (syncError) return toast(syncError, 'danger');
    toast('Rule saved', 'success');
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete this rule?', draft.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setRules(rules.filter((r) => r.id !== draft.id));
          syncNative();
          router.back();
        },
      },
    ]);

  const toggleApp = (pkg: string) =>
    setDraft((d) => ({ ...d, apps: d.apps.includes(pkg) ? d.apps.filter((p) => p !== pkg) : [...d.apps, pkg] }));

  return (
    <Screen footer={<Button label="Save rule" size="lg" onPress={save} />}>
      <Header title={existing ? 'Edit rule' : 'New rule'} onBack={() => router.back()} right={existing ? <IconButton icon={Trash2} label="Delete rule" tone="danger" onPress={remove} /> : undefined} />
      <TextField label="Name" value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} placeholder="e.g. Shopping offers" maxLength={60} />

      <SectionTitle title="What to do" />
      <SegmentedControl
        options={(Object.keys(ACTION_INFO) as RuleAction[]).map((a) => ({ value: a, label: ACTION_INFO[a].label }))}
        value={draft.action}
        onChange={(action) => setDraft((d) => ({ ...d, action }))}
      />
      <Text variant="caption" color="textMuted">
        {ACTION_INFO[draft.action].detail}
        {draft.action !== 'alert' ? ' Android may still play the app’s sound before Notivault removes it; turn that app’s sound off in its notification settings for full silence.' : ''}
      </Text>

      <SectionTitle title="Apps" />
      <Text variant="caption" color="textMuted">
        {draft.apps.length === 0 ? 'Any app. Pick apps to narrow it down.' : `${draft.apps.length} selected`}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {apps.map((a) => (
          <Chip key={a.package} label={a.app} selected={draft.apps.includes(a.package)} onPress={() => toggleApp(a.package)} />
        ))}
        {apps.length === 0 ? (
          <Text variant="caption" color="textFaint">
            Apps appear here once Notivault has seen their notifications.
          </Text>
        ) : null}
      </View>

      <SectionTitle title="Keywords" />
      <TextField value={keywordText} onChangeText={setKeywordText} placeholder="sale, offer, urgent" autoCapitalize="none" hint="Comma separated. Matches the title or text, ignoring case. Leave empty to match everything from the chosen apps." />

      <Card>
        <Text variant="caption" color="textMuted">
          This rule would have caught {preview} of your last {recent.length} notifications.
        </Text>
      </Card>
    </Screen>
  );
}

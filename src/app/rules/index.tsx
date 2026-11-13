import { Button, Card, EmptyState, Header, Screen, Text, Toggle, useTheme, useToast } from '@basalt/core';
import { useRouter } from 'expo-router';
import { ListFilter, Plus } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { ACTION_INFO } from '../../lib/rules';
import { rulesSetting, syncNative } from '../../lib/settings';

export default function Rules() {
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [rules, setRules] = rulesSetting.use();

  const toggle = (id: string, enabled: boolean) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, enabled } : r)));
    const error = syncNative();
    if (error) toast(error, 'danger');
  };

  return (
    <Screen footer={<Button label="New rule" icon={Plus} size="lg" onPress={() => router.push({ pathname: '/rules/[id]', params: { id: 'new' } })} />}>
      <Header title="Rules" subtitle="The first matching rule wins" onBack={() => router.back()} />
      {rules.length === 0 ? (
        <EmptyState
          icon={ListFilter}
          title="No rules yet"
          message="Quiet noisy apps, hold shopping and social notifications for a digest, or turn messages with “urgent” into priority alerts."
        />
      ) : (
        rules.map((rule) => (
          <Card key={rule.id} onPress={() => router.push({ pathname: '/rules/[id]', params: { id: rule.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: rule.enabled ? 1 : 0.6 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{rule.name}</Text>
              <Text variant="caption" color="textMuted" numberOfLines={2}>
                {ACTION_INFO[rule.action].label} · {rule.apps.length ? `${rule.apps.length} app${rule.apps.length === 1 ? '' : 's'}` : 'any app'}
                {rule.keywords.length ? ` · “${rule.keywords.join('”, “')}”` : ''}
              </Text>
            </View>
            <Toggle value={rule.enabled} accessibilityLabel={`Enable ${rule.name}`} onChange={(v) => toggle(rule.id, v)} />
          </Card>
        ))
      )}
    </Screen>
  );
}

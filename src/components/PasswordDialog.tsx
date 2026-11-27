import { Button, Text, TextField, useTheme } from '@basalt/core';
import React from 'react';
import { KeyboardAvoidingView, Modal, View } from 'react-native';

export interface PasswordDialogProps {
  visible: boolean;
  /** 'create' asks twice and allows skipping; 'unlock' asks once for an existing backup's password. */
  mode: 'create' | 'unlock';
  error?: string | null;
  busy?: boolean;
  onSubmit: (password: string | null) => void;
  onCancel: () => void;
}

export function PasswordDialog({ visible, mode, error, busy, onSubmit, onCancel }: PasswordDialogProps) {
  const { colors, radius, spacing } = useTheme();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [mismatch, setMismatch] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) {
      setPassword('');
      setConfirm('');
      setMismatch(null);
    }
  }, [visible]);

  const submit = () => {
    if (mode === 'unlock') return password ? onSubmit(password) : setMismatch('Enter the backup’s password.');
    if (!password) return onSubmit(null);
    if (password.length < 6) return setMismatch('Use at least 6 characters, or leave both fields empty.');
    if (password !== confirm) return setMismatch('The two passwords do not match.');
    onSubmit(password);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md }}>
          <Text variant="title">{mode === 'create' ? 'Protect this backup?' : 'Backup password'}</Text>
          <Text variant="caption" color="textMuted">
            {mode === 'create'
              ? 'The backup holds the text of your notifications. Add a password if you will keep it in a shared place like Drive or email. There is no way to recover a forgotten password.'
              : 'This backup is protected. Enter the password you chose when you made it.'}
          </Text>
          <TextField
            label="Password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setMismatch(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={mode === 'unlock'}
            placeholder={mode === 'create' ? 'Optional' : undefined}
            error={mode === 'unlock' ? mismatch ?? error : null}
            onSubmitEditing={mode === 'unlock' ? submit : undefined}
          />
          {mode === 'create' ? (
            <TextField
              label="Repeat password"
              value={confirm}
              onChangeText={(v) => {
                setConfirm(v);
                setMismatch(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              error={mismatch ?? error}
            />
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
            <Button label={mode === 'create' ? (password ? 'Save with password' : 'Save without password') : 'Open backup'} onPress={submit} loading={busy} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

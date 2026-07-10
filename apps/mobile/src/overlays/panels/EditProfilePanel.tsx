import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '../../components';
import { usersService, type UsernameAvailability } from '../../services/users';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';

// ─── editProfile — the REAL page body (trigger-nav pages) ───────────────────────────────────
// Display-name editing over PATCH /users/me + username claim over the existing
// check/claim endpoints (the onboarding picker's flow, re-homed as the settled page).
// Avatar upload is DEFERRED to the photos/upload story (product call on source + crop).
// Failure/empty per §5.6.

type LoadState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready' };

export const EditProfilePanelBody = React.memo(() => {
  const { closeActiveRoute } = useAppOverlayRouteController();
  const [loadState, setLoadState] = React.useState<LoadState>({ kind: 'loading' });
  const [displayName, setDisplayName] = React.useState('');
  const [savedDisplayName, setSavedDisplayName] = React.useState('');
  const [currentUsername, setCurrentUsername] = React.useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = React.useState('');
  const [availability, setAvailability] = React.useState<UsernameAvailability | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const loadSeqRef = React.useRef(0);
  const checkSeqRef = React.useRef(0);

  const load = React.useCallback(() => {
    const seq = ++loadSeqRef.current;
    setLoadState({ kind: 'loading' });
    void usersService
      .getMe()
      .then((me) => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setDisplayName(me.displayName ?? '');
        setSavedDisplayName(me.displayName ?? '');
        setCurrentUsername(me.username ?? null);
        setLoadState({ kind: 'ready' });
      })
      .catch(() => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setLoadState({ kind: 'failed' });
      });
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Debounced availability check while typing a username draft.
  React.useEffect(() => {
    const trimmed = usernameDraft.trim();
    if (!trimmed || trimmed === currentUsername) {
      setAvailability(null);
      return;
    }
    const seq = ++checkSeqRef.current;
    const timer = setTimeout(() => {
      void usersService
        .checkUsername(trimmed)
        .then((result) => {
          if (checkSeqRef.current === seq) {
            setAvailability(result);
          }
        })
        .catch(() => {
          if (checkSeqRef.current === seq) {
            setAvailability(null);
          }
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [currentUsername, usernameDraft]);

  const displayNameDirty = displayName.trim() !== savedDisplayName;
  const usernameClaimable =
    availability?.available === true && usernameDraft.trim() !== currentUsername;
  const canSave = !busy && (displayNameDirty || usernameClaimable);

  const handleSave = React.useCallback(() => {
    if (!canSave) {
      return;
    }
    setBusy(true);
    setNotice(null);
    // RT-3 (red-team 2026-07-10): SEQUENCED, reconciled per-op. The old Promise.all pair
    // deadlocked on partial failure: claim succeeds + update fails → retry re-claims the
    // name the user now owns → the 30-day cooldown 400 → the display name became unsavable
    // until remount. Each op now settles its own local state, so a retry only re-sends
    // what actually remains dirty.
    void (async () => {
      try {
        if (usernameClaimable) {
          await usersService.claimUsername(usernameDraft.trim());
          setCurrentUsername(usernameDraft.trim());
          setAvailability(null);
        }
        if (displayNameDirty) {
          await usersService.updateMe({ displayName: displayName.trim() });
          setSavedDisplayName(displayName.trim());
        }
        closeActiveRoute();
      } catch {
        setNotice('Couldn’t save — try again.');
      } finally {
        setBusy(false);
      }
    })();
  }, [canSave, closeActiveRoute, displayName, displayNameDirty, usernameClaimable, usernameDraft]);

  if (loadState.kind === 'loading') {
    return (
      <View style={styles.stateBody} testID="edit-profile-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (loadState.kind === 'failed') {
    return (
      <View style={styles.stateBody} testID="edit-profile-failed">
        <Text variant="body" style={styles.stateText}>
          We couldn’t load your profile.
        </Text>
        <Pressable
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
          testID="edit-profile-retry"
          style={styles.retryButton}
        >
          <Text variant="body" weight="semibold" style={styles.retryText}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.body} testID="stub-scene-editProfile">
      <Text variant="caption" style={styles.fieldLabel}>
        Display name
      </Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Your name"
        placeholderTextColor="#94a3b8"
        autoCapitalize="words"
        style={styles.input}
        testID="edit-profile-display-name"
      />

      <Text variant="caption" style={[styles.fieldLabel, styles.fieldSpacing]}>
        Username
      </Text>
      <TextInput
        value={usernameDraft}
        onChangeText={setUsernameDraft}
        placeholder={currentUsername ? `@${currentUsername}` : 'Pick a username'}
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        testID="edit-profile-username"
      />
      {availability != null ? (
        <Text
          variant="caption"
          style={availability.available ? styles.availabilityOk : styles.availabilityBad}
          testID="edit-profile-username-availability"
        >
          {availability.available
            ? `@${availability.normalized} is available`
            : availability.suggestions[0]
              ? `Taken — try @${availability.suggestions[0]}`
              : 'Not available'}
        </Text>
      ) : null}

      {notice ? (
        <Text variant="caption" style={styles.availabilityBad} testID="edit-profile-notice">
          {notice}
        </Text>
      ) : null}

      <Pressable
        onPress={handleSave}
        disabled={!canSave}
        accessibilityRole="button"
        accessibilityLabel="Save profile"
        testID="edit-profile-save"
        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text variant="body" weight="semibold" style={styles.saveText}>
            Save
          </Text>
        )}
      </Pressable>
    </View>
  );
});
EditProfilePanelBody.displayName = 'EditProfilePanelBody';

const styles = StyleSheet.create({
  body: {
    paddingVertical: 24,
    gap: 8,
  },
  stateBody: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  retryText: {
    color: '#0f172a',
  },
  fieldLabel: {
    color: '#64748b',
  },
  fieldSpacing: {
    marginTop: 16,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  availabilityOk: {
    color: '#16a34a',
  },
  availabilityBad: {
    color: '#dc2626',
  },
  saveButton: {
    marginTop: 24,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  saveButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  saveText: {
    color: '#ffffff',
  },
});

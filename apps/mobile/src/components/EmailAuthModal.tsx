import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { Text } from './ui/Text';
import { FONT_SIZES, LINE_HEIGHTS } from '../constants/typography';
import { logger } from '../utils';

type EmailAuthModalProps = {
  visible: boolean;
  onClose: () => void;
};

type AuthMode = 'signIn' | 'signUp';

export const EmailAuthModal: React.FC<EmailAuthModalProps> = ({ visible, onClose }) => {
  const { isLoaded: signInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();

  const [mode, setMode] = React.useState<AuthMode>('signIn');
  const [stage, setStage] = React.useState<'collect' | 'verify'>('collect');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'sending' | 'verifying'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const emailAddressIdRef = React.useRef<string | null>(null);

  const resetState = React.useCallback(() => {
    setMode('signIn');
    setStage('collect');
    setEmail('');
    setCode('');
    setStatus('idle');
    setError(null);
    emailAddressIdRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!visible) {
      resetState();
    }
  }, [visible, resetState]);

  const isBusy = status !== 'idle';
  const canSubmitEmail = email.trim().length > 3 && !isBusy;
  const canVerifyCode = code.trim().length >= 6 && !isBusy;

  const sendEmailCode = async () => {
    if (!canSubmitEmail) {
      return;
    }
    setStatus('sending');
    setError(null);
    try {
      if (mode === 'signIn') {
        if (!signInLoaded) {
          throw new Error('Sign-in not ready yet. Please try again.');
        }
        const createAttempt = await signIn.create({
          identifier: email.trim(),
        });
        const emailFactor = createAttempt.supportedFirstFactors?.find(
          (factor) => factor.strategy === 'email_code'
        );
        if (!emailFactor || !emailFactor.emailAddressId) {
          throw new Error('Email verification is not available for this account.');
        }
        emailAddressIdRef.current = emailFactor.emailAddressId;
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId,
        });
      } else {
        if (!signUpLoaded) {
          throw new Error('Sign-up not ready yet. Please try again.');
        }
        await signUp.create({
          emailAddress: email.trim(),
        });
        await signUp.prepareEmailAddressVerification({
          strategy: 'email_code',
        });
      }
      setStage('verify');
    } catch (err) {
      logger.error('Email auth send failed', err);
      const message =
        err instanceof Error ? err.message : 'We could not send a code. Please try again.';
      setError(message);
    } finally {
      setStatus('idle');
    }
  };

  const verifyEmailCode = async () => {
    if (!canVerifyCode) {
      return;
    }
    setStatus('verifying');
    setError(null);
    try {
      if (mode === 'signIn') {
        if (!signInLoaded || !emailAddressIdRef.current) {
          throw new Error('Sign-in session expired. Please restart.');
        }
        const attempt = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: code.trim(),
        });
        if (attempt.status === 'complete' && attempt.createdSessionId) {
          await setSignInActive({ session: attempt.createdSessionId });
          onClose();
        } else {
          throw new Error('Unable to sign in with that code. Try again.');
        }
      } else {
        if (!signUpLoaded) {
          throw new Error('Sign-up session expired. Please restart.');
        }
        const attempt = await signUp.attemptEmailAddressVerification({
          code: code.trim(),
        });
        if (attempt.status === 'complete' && attempt.createdSessionId) {
          await setSignUpActive({ session: attempt.createdSessionId });
          onClose();
        } else {
          throw new Error('Verification failed. Please request a new code.');
        }
      }
    } catch (err) {
      logger.error('Email auth verification failed', err);
      const message = err instanceof Error ? err.message : 'That code did not work.';
      setError(message);
    } finally {
      setStatus('idle');
    }
  };

  const toggleMode = () => {
    if (isBusy) {
      return;
    }
    setMode((prev) => (prev === 'signIn' ? 'signUp' : 'signIn'));
    setStage('collect');
    setEmail('');
    setCode('');
    setError(null);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.modalCard}>
          <Text variant="title" weight="bold" style={styles.modalTitle}>
            Continue with email
          </Text>
          <Text variant="body" style={styles.modalSubtitle}>
            {mode === 'signIn'
              ? 'Enter your email and we will send a six-digit code to sign in.'
              : 'Use your email to create an account. We will confirm it with a six-digit code.'}
          </Text>

          {stage === 'collect' ? (
            <View style={styles.formGroup}>
              <Text variant="caption" weight="semibold" style={styles.label}>
                Email address
              </Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                editable={!isBusy}
              />
              <TouchableOpacity
                style={[styles.primaryButton, !canSubmitEmail && styles.primaryButtonDisabled]}
                disabled={!canSubmitEmail}
                onPress={sendEmailCode}
              >
                <Text variant="body" weight="semibold" style={styles.primaryButtonText}>
                  {status === 'sending' ? 'Sending…' : 'Send code'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formGroup}>
              <Text variant="caption" weight="semibold" style={styles.label}>
                Verification code
              </Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="number-pad"
                placeholder="Enter 6-digit code"
                style={styles.input}
                value={code}
                onChangeText={setCode}
                editable={!isBusy}
                maxLength={8}
              />
              <TouchableOpacity
                style={[styles.primaryButton, !canVerifyCode && styles.primaryButtonDisabled]}
                disabled={!canVerifyCode}
                onPress={verifyEmailCode}
              >
                <Text variant="body" weight="semibold" style={styles.primaryButtonText}>
                  {status === 'verifying' ? 'Confirming…' : 'Verify & continue'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {error ? (
            <Text variant="caption" style={styles.errorText}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity style={styles.secondaryButton} onPress={toggleMode}>
            <Text variant="caption" style={styles.secondaryButtonText}>
              {mode === 'signIn'
                ? 'New to Crave? Create an account instead'
                : 'Already have an account? Sign in instead'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeLink} onPress={onClose}>
            <Text variant="caption" style={styles.closeLinkText}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    textAlign: 'center',
    color: '#475569',
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  primaryButtonText: {
    color: '#fff',
  },
  secondaryButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#6366f1',
  },
  closeLink: {
    marginTop: 6,
    alignItems: 'center',
  },
  closeLinkText: {
    color: '#94a3b8',
  },
  errorText: {
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 4,
  },
});

export default EmailAuthModal;

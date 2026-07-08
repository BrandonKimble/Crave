import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { PaywallScreen } from './PaywallScreen';

/**
 * Dev-only harness for the purchases flow (mirrors CutoutSkeletonDevPreview).
 * PaywallScreen has no production mount yet (screens thread owns that); this
 * overlays the REAL screen + real RC offering + real purchase path so the
 * Test Store / sandbox E2E can run before the screens work lands.
 *   show:  crave://paywall-preview?show=1
 *   hide:  crave://paywall-preview?show=0  (or the Not now button)
 */

const DEEP_LINK_HOST = 'paywall-preview';

export function PaywallDevPreview(): React.ReactElement | null {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url || !url.includes(DEEP_LINK_HOST)) {
        return;
      }
      const show = /[?&]show=(1|true|on|yes)/i.test(url);
      const hide = /[?&]show=(0|false|off|no)/i.test(url);
      if (hide) {
        setVisible(false);
      } else if (show) {
        setVisible(true);
      } else {
        setVisible((prev) => !prev);
      }
    };
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.root}>
      <PaywallScreen onClose={() => setVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    zIndex: 1000,
  },
});

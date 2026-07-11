// The ONE clipboard seam. react-native's Clipboard is deprecated; the ideal
// replacement is expo-clipboard, but it ships a NATIVE module that is NOT in
// the current dev-client pods (ios/Podfile.lock has no ExpoClipboard).
// MIGRATION TRIGGER: at the next native rebuild, `npx expo install
// expo-clipboard`, swap the import below to `import * as Clipboard from
// 'expo-clipboard'` (setString → setStringAsync), and delete this comment.
import { Clipboard } from 'react-native';

export const setClipboardString = (value: string): void => {
  Clipboard.setString(value);
};

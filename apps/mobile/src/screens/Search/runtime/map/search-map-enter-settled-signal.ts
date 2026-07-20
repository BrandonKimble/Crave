// THE MAP ENTER-SETTLED SIGNAL (catalog pre-staging arc 2026-07-19): one producer —
// the native render owner's 'presentation_enter_settled' event handler — notifying
// module-scope listeners. The results landing clock holds its post-above-fold beats
// on this signal so Fabric row mounts never land on the main thread DURING the pin
// fade ramp (the attributed snap mechanism: the ramp's frames were eaten by row
// mounts + the live frame apply). Listeners must pair with a bounded fallback —
// episodes without a map enter never fire this.

type Listener = () => void;
const listeners = new Set<Listener>();

export const notifyMapEnterSettled = (): void => {
  listeners.forEach((listener) => {
    listener();
  });
};

export const subscribeMapEnterSettled = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

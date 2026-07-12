// THE VISUAL-FLOOR SIGNAL (toggle-strip primitive T3): a tiny module singleton carrying
// "is the map presentation at its fade-out floor?" from the native render owner (the
// sole consumer of the native `presentation_fade_out_acked` / `presentation_enter_started`
// events) to the toggle interaction engine's commit gate. Same settable-module precedent
// as search-reconciler-presentation-port. Level semantics: `atFloor` flips true on the
// floor ack and false the moment an enter ramp starts; listeners fire on the ack edge so
// a gated commit lands exactly when the fade-out bottoms out.

type FloorListener = () => void;

let atFloor = false;
const listeners = new Set<FloorListener>();

export const notifySearchPresentationFloorReached = (): void => {
  atFloor = true;
  listeners.forEach((listener) => listener());
};

export const notifySearchPresentationFloorLeft = (): void => {
  atFloor = false;
};

export const isSearchPresentationAtFloor = (): boolean => atFloor;

export const subscribeSearchPresentationFloor = (listener: FloorListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

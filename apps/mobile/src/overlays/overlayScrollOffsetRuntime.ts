const overlayScrollOffsets = new Map<string, number>();

export const setOverlayScrollOffset = (
  overlayIdentity: string,
  offset: number
): void => {
  const nextOffset = Math.max(0, offset);
  const existing = overlayScrollOffsets.get(overlayIdentity);
  if (existing != null && Math.abs(existing - nextOffset) < 1) {
    return;
  }
  overlayScrollOffsets.set(overlayIdentity, nextOffset);
};

export const getOverlayScrollOffset = (overlayIdentity: string): number =>
  overlayScrollOffsets.get(overlayIdentity) ?? 0;

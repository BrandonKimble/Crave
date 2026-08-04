// ─── @shopify/flash-list mock (render lane) ──────────────────────────────────
//
// A plain synchronous list: header, every row through the REAL renderItem the
// page passed, footer. Class component so the page's findNodeHandle(ref) gets
// an instance. The last-mounted instance is exposed so tests can read the
// props the page delivered (data identity, onScroll handlers) and drive the
// scroll handler like the native track would.

import React from 'react';

export type FlashListProps<T> = Record<string, unknown> & {
  data?: readonly T[];
  renderItem?: (info: { item: T; index: number }) => React.ReactNode;
};

export const flashListRegistry: { instance: FlashList | null } = { instance: null };

export class FlashList extends React.Component<FlashListProps<unknown>> {
  render(): React.ReactElement {
    flashListRegistry.instance = this;
    const { data, renderItem, ListHeaderComponent, ListFooterComponent, ListEmptyComponent } = this
      .props as {
      data?: readonly unknown[];
      renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: unknown;
      ListFooterComponent?: unknown;
      ListEmptyComponent?: unknown;
    };
    const renderSlot = (slot: unknown): React.ReactNode => {
      if (slot == null) {
        return null;
      }
      if (React.isValidElement(slot)) {
        return slot;
      }
      const Slot = slot as React.ComponentType;
      return <Slot />;
    };
    const rows = (data ?? []).map((item, index) => (
      <React.Fragment key={index}>{renderItem?.({ item, index }) ?? null}</React.Fragment>
    ));
    return (
      <>
        {renderSlot(ListHeaderComponent)}
        {rows.length === 0 ? renderSlot(ListEmptyComponent) : rows}
        {renderSlot(ListFooterComponent)}
      </>
    );
  }
}

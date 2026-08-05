import React from 'react';
import { StyleSheet, Text } from 'react-native';

// ─── TWO SHARED RENDER PRIMITIVES ─────────────────────────────────────────────
// Both the host (title, compose chin) and the leg resolver (per-leg strip, per-
// leg body, list leader) need these. They live in their own module rather than
// in either consumer because the host imports the resolver — the other direction
// would be a cycle.

/** A registry component that needs the OLD host's contexts is a FINDING, not a
 *  crash — surface it in place. */
export class ChromeProbeBoundary extends React.Component<
  { label: string; children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: String(error) };
  }
  render() {
    if (this.state.error != null) {
      return (
        <Text style={probeStyles.error} numberOfLines={3}>
          [{this.props.label}] needs host context: {this.state.error}
        </Text>
      );
    }
    return this.props.children;
  }
}

const probeStyles = StyleSheet.create({
  error: { color: '#b91c1c', fontSize: 11, padding: 8 },
});

/** Published specs carry ListHeaderComponent as element OR component type. */
export const renderListLeader = (leader: unknown): React.ReactNode => {
  if (leader == null) {
    return null;
  }
  if (React.isValidElement(leader)) {
    return leader;
  }
  const Leader = leader as React.ComponentType;
  return <Leader />;
};

import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { type EntityRef } from '../../navigation/runtime/entity-ref-action-policy';
import { useEntityRefActionExecutor } from '../../navigation/runtime/use-entity-ref-action-executor';
import { colors as themeColors } from '../../constants/theme';

type EntityLinkProps = {
  entityRef: EntityRef;
  /** The visible text (a span's surface text). Defaults to the ref's label. */
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
};

const spanStyle: TextStyle = {
  color: themeColors.primary,
  fontWeight: '600',
};
const linkStyle: TextStyle = {
  textDecorationLine: 'underline',
};

/**
 * S-D.1 — THE entity link (plans/s-d-one-desire-entitylink.md I6): renders a tappable
 * entity span and executes its tap through resolveEntityRefAction. Zero per-surface
 * wiring: consumers pass an EntityRef, nothing else. An unresolved ref (empty entityId)
 * renders the span styling without a press affordance — same as the poll spans always did.
 *
 * Execution (S-D.1): restaurantWorld/entityDesire ride the launch-intent lane (dissolved
 * in S-D.4); pushScene pushes the child route directly.
 */
export const EntityLink = ({ entityRef, children, style }: EntityLinkProps): React.JSX.Element => {
  const executeEntityRefAction = useEntityRefActionExecutor();
  const tappable = entityRef.entityId.length > 0;
  const handlePress = React.useCallback(() => {
    executeEntityRefAction(entityRef);
  }, [entityRef, executeEntityRefAction]);
  return (
    <Text
      style={[spanStyle, tappable && linkStyle, style]}
      onPress={tappable ? handlePress : undefined}
      suppressHighlighting={!tappable}
    >
      {children ?? entityRef.label}
    </Text>
  );
};

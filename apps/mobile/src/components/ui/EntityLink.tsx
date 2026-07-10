import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useAppRouteCoordinator } from '../../navigation/runtime/AppRouteCoordinator';
import {
  resolveEntityRefAction,
  type EntityRef,
} from '../../navigation/runtime/entity-ref-action-policy';
import { useAppOverlayRouteController } from '../../overlays/useAppOverlayRouteController';
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
  const { dispatchLaunchIntent } = useAppRouteCoordinator();
  const { pushRoute } = useAppOverlayRouteController();
  const tappable = entityRef.entityId.length > 0;
  const handlePress = React.useCallback(() => {
    const action = resolveEntityRefAction(entityRef);
    switch (action.kind) {
      case 'restaurantWorld':
        dispatchLaunchIntent({
          type: 'restaurant',
          restaurantId: action.restaurantId,
          restaurantName: action.restaurantName,
        });
        return;
      case 'entityDesire':
        dispatchLaunchIntent({
          type: 'entity',
          entityId: action.entityId,
          entityType: action.entityType,
          submittedLabel: action.label,
        });
        return;
      case 'pushScene':
        if (action.scene === 'userProfile') {
          pushRoute('userProfile', { userId: action.params.userId });
          return;
        }
        pushRoute('listDetail', { listId: action.params.listId });
        return;
    }
  }, [dispatchLaunchIntent, entityRef, pushRoute]);
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

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { CUTOUT_SKELETON_CONFIG } from './cutout-skeleton-config';

// ─── THE FROST MATERIAL (skeleton-sheet law §2 — the over-white frost look) ─────────
//
// The self-frost's disease, owner-named: a BlurView over the sheet's white body has
// nothing to blur, so the old gray tint read as "grayer blocks on the sheet," never
// as cutouts. The frost-THROUGH scenes look right because their holes reveal the
// blurred MAP — soft pastel depth under the light frost tint. This material is that
// look, designed: a soft cool base + two large pastel depth blooms (the blurred-map
// impression) + the standard light frost tint on top. Static by design — the domino
// shimmer rides above it, masked by the plate's holes.
//
// Every knob lives in CUTOUT_SKELETON_CONFIG.frostMaterial — the owner-eye iteration
// loop is: dial in the dev preview, copy numbers here, per the config's own contract.

const FrostMaterialBackdrop = () => {
  const material = CUTOUT_SKELETON_CONFIG.frostMaterial;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: material.baseColor }]} />
      <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
        <Defs>
          <RadialGradient id="frost-bloom-a" cx="22%" cy="18%" r="85%">
            <Stop offset="0" stopColor={material.bloomColorA} stopOpacity={material.bloomOpacityA} />
            <Stop offset="1" stopColor={material.bloomColorA} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="frost-bloom-b" cx="82%" cy="78%" r="90%">
            <Stop offset="0" stopColor={material.bloomColorB} stopOpacity={material.bloomOpacityB} />
            <Stop offset="1" stopColor={material.bloomColorB} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#frost-bloom-a)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#frost-bloom-b)" />
      </Svg>
      <View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: material.tintColor }]}
      />
    </View>
  );
};

export default FrostMaterialBackdrop;

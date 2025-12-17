import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Reanimated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type SquircleSpinnerProps = {
  size?: number;
  color: string;
  strokeWidth?: number;
  durationMs?: number;
  trackOpacity?: number;
};

const buildSquirclePath = (size: number, exponent = 3.6, points = 96) => {
  const center = size / 2;
  const radius = center;
  const coords: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < points; i += 1) {
    const theta = (2 * Math.PI * i) / points;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const x =
      center +
      radius * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / exponent);
    const y =
      center +
      radius * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / exponent);
    coords.push({ x, y });
  }

  const d =
    coords.length === 0
      ? ''
      : `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)} ` +
        coords
          .slice(1)
          .map((pt) => `L${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
          .join(' ') +
        ' Z';

  let length = 0;
  for (let i = 0; i < coords.length; i += 1) {
    const a = coords[i];
    const b = coords[(i + 1) % coords.length];
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }

  return { d, length };
};

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

const SquircleSpinner: React.FC<SquircleSpinnerProps> = ({
  size = 22,
  color,
  strokeWidth = 2.5,
  durationMs = 900,
  trackOpacity = 0.18,
}) => {
  const { d, length, inset } = React.useMemo(() => {
    const inset = Math.max(0, strokeWidth / 2);
    const drawableSize = Math.max(1, size - inset * 2);
    const path = buildSquirclePath(drawableSize);
    return { d: path.d, length: path.length, inset };
  }, [size, strokeWidth]);
  const dashOffset = useSharedValue(0);

  React.useEffect(() => {
    dashOffset.value = 0;
    dashOffset.value = withRepeat(
      withTiming(-length, { duration: durationMs, easing: Easing.linear }),
      -1,
      false
    );
  }, [dashOffset, durationMs, length]);

  const segmentLength = Math.max(6, length * 0.28);
  const dashArray = React.useMemo(
    () => `${segmentLength.toFixed(2)} ${Math.max(0, length - segmentLength).toFixed(2)}`,
    [length, segmentLength]
  );

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  if (!d || length <= 0) {
    return null;
  }

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path
          d={d}
          fill="none"
          stroke={color}
          strokeOpacity={trackOpacity}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={`translate(${inset} ${inset})`}
        />
        <AnimatedPath
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashArray}
          animatedProps={animatedProps}
          transform={`translate(${inset} ${inset})`}
        />
      </Svg>
    </View>
  );
};

export default SquircleSpinner;

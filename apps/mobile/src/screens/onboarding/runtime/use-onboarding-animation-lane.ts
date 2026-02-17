import React from 'react';
import { Animated, Easing } from 'react-native';

type UseOnboardingAnimationLaneArgs = {
  calendarAnimation: React.MutableRefObject<Animated.CompositeAnimation | null>;
  calendarDayAnims: Animated.Value[];
  calendarColorAnims: Animated.Value[];
};

type UseOnboardingAnimationLaneResult = {
  triggerCalendarAnimation: () => void;
};

export const useOnboardingAnimationLane = ({
  calendarAnimation,
  calendarDayAnims,
  calendarColorAnims,
}: UseOnboardingAnimationLaneArgs): UseOnboardingAnimationLaneResult => {
  const triggerCalendarAnimation = React.useCallback(() => {
    if (calendarDayAnims.length === 0) {
      for (let i = 0; i < 60; i += 1) {
        calendarDayAnims.push(new Animated.Value(0));
        calendarColorAnims.push(new Animated.Value(0));
      }
    }

    calendarAnimation.current?.stop();
    calendarAnimation.current = null;
    calendarDayAnims.forEach((anim) => anim.setValue(0));
    calendarColorAnims.forEach((anim) => anim.setValue(0));

    const firstDayAnims = calendarDayAnims.slice(0, 30);
    const secondDayAnims = calendarDayAnims.slice(30);
    const firstColorAnims = calendarColorAnims.slice(0, 30);
    const secondColorAnims = calendarColorAnims.slice(30);

    const createAppear = (animations: Animated.Value[]) =>
      Animated.stagger(
        10,
        animations.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 110,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
          })
        )
      );

    const createColor = (animations: Animated.Value[]) =>
      Animated.stagger(
        25,
        animations.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 240,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
          })
        )
      );

    const animationSequence = Animated.sequence([
      createAppear(firstDayAnims),
      Animated.delay(40),
      createColor(firstColorAnims),
      Animated.delay(140),
      createAppear(secondDayAnims),
      Animated.delay(40),
      createColor(secondColorAnims),
    ]);

    calendarAnimation.current = animationSequence;
    requestAnimationFrame(() => {
      calendarAnimation.current?.start(() => {
        calendarAnimation.current = null;
      });
    });
  }, [calendarAnimation, calendarColorAnims, calendarDayAnims]);

  return {
    triggerCalendarAnimation,
  };
};

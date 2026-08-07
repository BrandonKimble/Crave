import React from 'react';
import { Animated, Easing } from 'react-native';

type UseOnboardingAnimationLaneArgs = {
  calendarAnimation: React.MutableRefObject<Animated.CompositeAnimation | null>;
  /**
   * F815: the calendar comparison graph renders two side-by-side calendar
   * months (see Onboarding.tsx `totalDays = 30`, "30 days (full month)").
   * One Animated.Value per day, per column, is what these arrays back — the
   * count is derived from that geometry, not a bare constant. Was hard-coded
   * `60` (2×30) with the ×2 unstated.
   */
  daysPerCalendarColumn: number;
};

type UseOnboardingAnimationLaneResult = {
  triggerCalendarAnimation: () => void;
  /**
   * Cancels any pending scheduling frame AND stops the running sequence.
   * F3704: the trigger schedules a `requestAnimationFrame`; without a handle a
   * frame that lands after unmount would assign and start a new animation on an
   * unmounted tree. The consumer's effect cleanup MUST call this.
   */
  disposeCalendarAnimation: () => void;
  calendarDayAnims: Animated.Value[];
  calendarColorAnims: Animated.Value[];
};

export const useOnboardingAnimationLane = ({
  calendarAnimation,
  daysPerCalendarColumn,
}: UseOnboardingAnimationLaneArgs): UseOnboardingAnimationLaneResult => {
  const totalDays = daysPerCalendarColumn * 2;
  const scheduledFrame = React.useRef<number | null>(null);
  const calendarDayAnims = React.useRef<Animated.Value[]>([]).current;
  const calendarColorAnims = React.useRef<Animated.Value[]>([]).current;
  if (calendarDayAnims.length === 0) {
    for (let i = 0; i < totalDays; i += 1) {
      calendarDayAnims.push(new Animated.Value(0));
      calendarColorAnims.push(new Animated.Value(0));
    }
  }

  const disposeCalendarAnimation = React.useCallback(() => {
    if (scheduledFrame.current !== null) {
      cancelAnimationFrame(scheduledFrame.current);
      scheduledFrame.current = null;
    }
    calendarAnimation.current?.stop();
    calendarAnimation.current = null;
  }, [calendarAnimation]);

  const triggerCalendarAnimation = React.useCallback(() => {
    if (scheduledFrame.current !== null) {
      cancelAnimationFrame(scheduledFrame.current);
      scheduledFrame.current = null;
    }
    calendarAnimation.current?.stop();
    calendarAnimation.current = null;
    calendarDayAnims.forEach((anim) => anim.setValue(0));
    calendarColorAnims.forEach((anim) => anim.setValue(0));

    const firstDayAnims = calendarDayAnims.slice(0, daysPerCalendarColumn);
    const secondDayAnims = calendarDayAnims.slice(daysPerCalendarColumn);
    const firstColorAnims = calendarColorAnims.slice(0, daysPerCalendarColumn);
    const secondColorAnims = calendarColorAnims.slice(daysPerCalendarColumn);

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
    scheduledFrame.current = requestAnimationFrame(() => {
      scheduledFrame.current = null;
      calendarAnimation.current?.start(() => {
        calendarAnimation.current = null;
      });
    });
  }, [calendarAnimation, calendarColorAnims, calendarDayAnims, daysPerCalendarColumn]);

  return {
    triggerCalendarAnimation,
    disposeCalendarAnimation,
    calendarDayAnims,
    calendarColorAnims,
  };
};

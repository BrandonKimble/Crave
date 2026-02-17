import type { OnboardingStep } from '../../../constants/onboarding';

export const findAdjacentVisibleStepIndex = ({
  startIndex,
  direction,
  steps,
  isVisible,
}: {
  startIndex: number;
  direction: 'next' | 'previous';
  steps: OnboardingStep[];
  isVisible: (step: OnboardingStep) => boolean;
}): number => {
  if (direction === 'next') {
    for (let index = startIndex + 1; index < steps.length; index += 1) {
      if (isVisible(steps[index])) {
        return index;
      }
    }
    return startIndex;
  }

  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (isVisible(steps[index])) {
      return index;
    }
  }
  return startIndex;
};

export const getVisibleStepPosition = ({
  index,
  steps,
  isVisible,
}: {
  index: number;
  steps: OnboardingStep[];
  isVisible: (step: OnboardingStep) => boolean;
}): number => {
  let position = 0;
  for (let cursor = 0; cursor <= index; cursor += 1) {
    if (isVisible(steps[cursor])) {
      position += 1;
    }
  }
  return Math.max(1, position);
};

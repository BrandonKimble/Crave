import { useAuthController, type AuthControllerState } from '../../../hooks/use-auth-controller';

export type OnboardingAuthLaneState = AuthControllerState;

type UseOnboardingAuthLaneArgs = {
  navigation: unknown;
};

export const useOnboardingAuthLane = ({
  navigation: _navigation,
}: UseOnboardingAuthLaneArgs): OnboardingAuthLaneState => useAuthController();

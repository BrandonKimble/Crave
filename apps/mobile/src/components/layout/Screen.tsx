import React from 'react';
import { View, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import clsx from 'clsx';

interface ScreenProps extends ViewProps {
  safeArea?: boolean;
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  className,
  safeArea = true,
  ...rest
}) => {
  const Container = safeArea ? SafeAreaView : View;
  return (
    <Container className={clsx('flex-1 bg-background px-4 py-6', className)} {...rest}>
      {children}
    </Container>
  );
};

export default Screen;

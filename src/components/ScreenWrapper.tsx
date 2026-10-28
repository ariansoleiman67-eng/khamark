import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from './ThemeProvider';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  addTabBarPadding?: boolean;
}

const ScreenWrapper: React.FC<ScreenWrapperProps> = ({ 
  children, 
  style, 
  addTabBarPadding = false 
}) => {
  const { theme } = useTheme();
  
  const wrapperStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
    ...(addTabBarPadding ? { paddingBottom: 0 } : {}),
    ...style,
  };
  
  return <View style={wrapperStyle}>{children}</View>;
};

export default ScreenWrapper;

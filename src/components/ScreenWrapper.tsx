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
  addTabBarPadding = true 
}) => {
  const { theme } = useTheme();
  
  const wrapperStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background, // Use theme background instead of hardcoded orange-white
    paddingBottom: addTabBarPadding ? 110 : 0,
    ...style,
  };
  
  return <View style={wrapperStyle}>{children}</View>;
};

export default ScreenWrapper;

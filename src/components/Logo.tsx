import React, { useState } from 'react';
import { View, StyleSheet, ViewStyle, Text } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface LogoProps {
  size?: number;
  style?: ViewStyle;
  variant?: 'default' | 'white' | 'dark';
}

const Logo: React.FC<LogoProps> = ({ 
  size = 60, 
  style,
  variant = 'default' 
}) => {
  const [imageError, setImageError] = useState(false);
  
  const containerBg = variant === 'white' ? 'rgba(255, 255, 255, 0.2)' : 
                     variant === 'dark' ? 'rgba(0, 0, 0, 0.1)' : 
                     '#A61920';
  
  const fallbackColor = variant === 'white' ? '#ffffff' : 
                       variant === 'dark' ? '#333333' : 
                       '#ffffff';

  // Check if style contains aspectRatio (responsive mode) or use fixed size
  const flatStyle = StyleSheet.flatten(style) || {};
  const useResponsiveMode = flatStyle.aspectRatio !== undefined || flatStyle.maxWidth !== undefined;
  
  // Calculate effective size for inner elements (use maxWidth or size)
  const effectiveSize = (flatStyle.maxWidth as number) || size;

  return (
    <View style={[
      styles.container, 
      // Only apply fixed dimensions if NOT using responsive mode
      !useResponsiveMode && { 
        width: size, 
        height: size,
        borderRadius: size / 2,
      },
      // Always apply these styles
      {
        backgroundColor: containerBg,
        borderWidth: 2,
        borderColor: variant === 'white' ? 'rgba(255, 255, 255, 0.3)' : 
                    variant === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 
                    '#E7E7EA',
      }, 
      // Apply passed style last (may include maxWidth, aspectRatio, borderRadius)
      style
    ]}>
      {!imageError ? (
        <Image
          source={require('../../assets/images/khamark_logo.png')}
          style={[
            styles.logo,
            // In responsive mode, use percentage-based sizing
            useResponsiveMode ? {
              width: '90%',
              aspectRatio: 1,
            } : { 
              width: effectiveSize * 0.9, 
              height: effectiveSize * 0.9,
              borderRadius: (effectiveSize * 0.9) / 2,
            }
          ]}
          contentFit="contain"
          transition={200}
          onError={() => setImageError(true)}
        />
      ) : (
        // Fallback: Show Khamark K initial
        <View style={styles.fallback}>
          <Text allowFontScaling={false} style={[
            styles.fallbackText, 
            { 
              fontSize: effectiveSize * 0.3,
              color: fallbackColor,
            }
          ]}>
            K
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    elevation: 3,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  fallback: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  fallbackText: {
    fontFamily: 'System',
    fontWeight: 'bold',
  },
  logo: {
    overflow: 'hidden',
  },
});

export default Logo;

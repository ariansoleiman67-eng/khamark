/**
 * GLOBAL PRESSABLE/BUTTON PATCH - Samsung Device Fix
 * 
 * Ensures buttons expand safely when text scales by:
 * - Using minHeight instead of fixed height
 * - Enforcing paddingVertical for vertical centering
 * - Always using justifyContent: 'center'
 * 
 * Uses defaultProps patching instead of render override for:
 * - Fabric/New Architecture compatibility
 * - RN version stability
 * 
 * This patch must be imported ONCE at app entry point (App.tsx)
 * BEFORE any components render.
 */

import { Platform, Pressable, TouchableOpacity, ViewStyle } from 'react-native';

if (Platform.OS === 'android') {
  const safeStyle: ViewStyle = {
    minHeight: 44,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  };

  // Patch Pressable defaultProps (stable API)
  (Pressable as any).defaultProps = {
    ...((Pressable as any).defaultProps || {}),
    style: [safeStyle, ((Pressable as any).defaultProps as any)?.style],
  };

  // Patch TouchableOpacity defaultProps (stable API)
  (TouchableOpacity as any).defaultProps = {
    ...((TouchableOpacity as any).defaultProps || {}),
    style: [safeStyle, ((TouchableOpacity as any).defaultProps as any)?.style],
  };
}

export {};

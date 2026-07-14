/**
 * GOLDEN TEMPLATE: Order Status Badge
 * 
 * Single source of truth for order status display.
 * Used in User Orders, Order Details, Admin screens.
 * 
 * Rules (LOCKED):
 * - Same component everywhere
 * - No custom text per screen
 * - Uses normalizeOrderStatus for backward compat
 * 
 * SAMSUNG ARABIC FIX (LOCKED - ALIBABA/AMAZON PATTERN):
 * Badge width MUST be content-driven, never constrained.
 * - NO fixed width, NO maxWidth, NO flex shrinking
 * - alignSelf: 'flex-start' (content-driven width)
 * - minHeight instead of paddingVertical
 * - includeFontPadding: false on text (Samsung fix)
 * - textAlignVertical: 'center' on text
 * - textAlign: 'right' for RTL safety
 * - allowFontScaling: false
 * - NO numberOfLines, NO ellipsizeMode, NO writingDirection
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';
import { OrderStatus, normalizeOrderStatus } from '../types';

interface OrderStatusBadgeProps {
  status: string; // Accept string for backward compat
  size?: 'small' | 'medium' | 'large';
}

/**
 * Get display text and color for each status
 */
export const getStatusConfig = (status: OrderStatus, t: (key: string) => string) => {
  switch (status) {
    case 'pending':
      return {
        text: t('orders.status.pending'),
        color: '#6B7280', // gray
        bgColor: '#F3F4F6',
      };
    case 'confirmed':
      return {
        text: t('orders.status.confirmed'),
        color: '#2563EB', // blue
        bgColor: '#DBEAFE',
      };
    case 'processing':
      return {
        text: t('orders.status.processing'),
        color: '#2563EB', // blue
        bgColor: '#DBEAFE',
      };
    case 'shipped':
      return {
        text: t('orders.status.shipped'),
        color: '#7C3AED', // purple
        bgColor: '#EDE9FE',
      };
    case 'delivered':
      return {
        text: t('orders.status.delivered'),
        color: '#059669', // green
        bgColor: '#D1FAE5',
      };
    case 'cancelled_by_store':
      return {
        text: t('orders.status.cancelledByStore'),
        color: '#DC2626', // red
        bgColor: '#FEE2E2',
      };
    case 'cancelled_by_user':
      return {
        text: t('orders.status.cancelledByUser'),
        color: '#D97706', // orange
        bgColor: '#FEF3C7',
      };
    default:
      return {
        text: t('orders.status.unknown'),
        color: '#6B7280',
        bgColor: '#F3F4F6',
      };
  }
};

/**
 * SAMSUNG ARABIC FIX: Size variants using minHeight instead of paddingVertical
 * Height is controlled by minHeight, NOT padding
 */
const SIZE_CONFIG = {
  small: { minHeight: 18, paddingHorizontal: 6, fontSize: 10, borderRadius: 9 },
  medium: { minHeight: 22, paddingHorizontal: 10, fontSize: 12, borderRadius: 11 },
  large: { minHeight: 28, paddingHorizontal: 14, fontSize: 14, borderRadius: 14 },
};

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({
  status,
  size = 'medium',
}) => {
  const { t } = useTranslation();
  const { isDark } = useTheme();

  // Normalize for backward compatibility
  const normalizedStatus = normalizeOrderStatus(status);
  const config = getStatusConfig(normalizedStatus, t);
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isDark ? config.color + '30' : config.bgColor,
          minHeight: sizeConfig.minHeight,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          borderRadius: sizeConfig.borderRadius,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: config.color,
            fontSize: sizeConfig.fontSize,
          },
        ]}
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        numberOfLines={1}
      >
        {config.text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  /**
   * SAMSUNG ARABIC FIX (LOCKED - ALIBABA/AMAZON PATTERN):
   * - alignSelf: 'flex-start' = width driven by content (CRITICAL)
   * - NO fixed width, NO maxWidth, NO flex shrinking
   * - minHeight controls height (NOT padding)
   * - alignItems + justifyContent center the text
   */
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0, // Samsung RTL fix: never shrink
    justifyContent: 'center',
  },
  /**
   * SAMSUNG ARABIC FIX (LOCKED):
   * - includeFontPadding: false removes fake ascent/descent (Samsung)
   * - textAlignVertical: 'center' centers within minHeight
   * - textAlign: 'right' for RTL safety
   * - NO numberOfLines, NO ellipsizeMode, NO writingDirection
   */
  text: {
    fontWeight: '600',
    includeFontPadding: false,
    textAlign: 'right', // RTL-safe (Samsung fix)
    textAlignVertical: 'center',
  },
});

export default OrderStatusBadge;


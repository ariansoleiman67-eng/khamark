/**
 * GOLDEN TEMPLATE: Static Skeleton Loader
 * 
 * Alibaba-safe skeleton placeholders for loading states.
 * 
 * Rules (LOCKED):
 * - NO shimmer
 * - NO animation
 * - NO Reanimated
 * - Must match exact layout dimensions
 * - Disappears instantly when data arrives
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from './ThemeProvider';

interface StaticSkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: ViewStyle;
}

/**
 * Static skeleton placeholder - no animation, no shimmer
 */
export const StaticSkeleton: React.FC<StaticSkeletonProps> = ({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}) => {
  const { theme, isDark } = useTheme();
  
  // Use theme-aware color
  const backgroundColor = isDark ? '#374151' : '#E5E7EB';

  return (
    <View
      style={[
        styles.skeleton,
        { 
          width: width as any, 
          height: height as any, 
          borderRadius: radius,
          backgroundColor,
        },
        style,
      ]}
    />
  );
};

/**
 * Product Details skeleton - matches ProductDetailsScreen layout
 */
export const ProductDetailsSkeleton: React.FC = () => {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Image placeholder - aspectRatio 1 */}
      <StaticSkeleton height={300} radius={0} />
      
      {/* Content area */}
      <View style={styles.content}>
        {/* Title */}
        <StaticSkeleton height={24} style={styles.marginTop} />
        <StaticSkeleton height={24} width="70%" style={styles.marginTopSm} />
        
        {/* Part number */}
        <StaticSkeleton height={16} width="40%" style={styles.marginTop} />
        
        {/* Price row */}
        <View style={styles.priceRow}>
          <StaticSkeleton height={28} width={100} />
          <StaticSkeleton height={24} width={80} radius={12} />
        </View>
        
        {/* Description */}
        <StaticSkeleton height={20} style={styles.marginTopLg} />
        <StaticSkeleton height={100} style={styles.marginTopSm} />
        
        {/* Specifications */}
        <StaticSkeleton height={20} style={styles.marginTopLg} />
        <StaticSkeleton height={120} style={styles.marginTopSm} />
      </View>
    </View>
  );
};

/**
 * Related Products skeleton row
 */
export const RelatedProductsSkeleton: React.FC = () => {
  return (
    <View style={styles.relatedRow}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.relatedCard}>
          <StaticSkeleton height={120} radius={8} />
          <StaticSkeleton height={14} style={styles.marginTopSm} />
          <StaticSkeleton height={14} width="60%" style={styles.marginTopXs} />
          <StaticSkeleton height={16} width="50%" style={styles.marginTopSm} />
        </View>
      ))}
    </View>
  );
};

/**
 * Cart Item skeleton
 */
export const CartItemSkeleton: React.FC = () => {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.cartItem, { borderColor: theme.colors.border }]}>
      <StaticSkeleton height={80} width={80} radius={8} />
      <View style={styles.cartItemContent}>
        <StaticSkeleton height={16} />
        <StaticSkeleton height={14} width="60%" style={styles.marginTopSm} />
        <StaticSkeleton height={20} width="40%" style={styles.marginTop} />
      </View>
    </View>
  );
};

/**
 * Cart Screen skeleton - multiple items
 */
export const CartScreenSkeleton: React.FC = () => {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {[1, 2, 3].map((i) => (
        <CartItemSkeleton key={i} />
      ))}
    </View>
  );
};

/**
 * Order Card skeleton
 */
export const OrderCardSkeleton: React.FC = () => {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.orderCard, { 
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    }]}>
      <View style={styles.orderHeader}>
        <StaticSkeleton height={16} width={120} />
        <StaticSkeleton height={24} width={80} radius={12} />
      </View>
      <StaticSkeleton height={14} width="60%" style={styles.marginTop} />
      <StaticSkeleton height={14} width="40%" style={styles.marginTopSm} />
    </View>
  );
};

/**
 * Orders List skeleton
 */
export const OrdersListSkeleton: React.FC = () => {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {[1, 2, 3, 4].map((i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  cartItem: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 16,
    paddingVertical: 16,
  },
  cartItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  marginTop: {
    marginTop: 16,
  },
  marginTopLg: {
    marginTop: 24,
  },
  marginTopSm: {
    marginTop: 8,
  },
  marginTopXs: {
    marginTop: 4,
  },
  orderCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    marginHorizontal: 16,
    padding: 16,
  },
  orderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  relatedCard: {
    marginRight: 16,
    width: 140,
  },
  relatedRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skeleton: {
    // Base skeleton style - backgroundColor set dynamically
  },
});

export default StaticSkeleton;

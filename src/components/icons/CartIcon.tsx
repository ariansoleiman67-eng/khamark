import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  size: number;
  color: string;
};

/**
 * CartIcon - GOLDEN SINGLE SOURCE OF TRUTH
 * 
 * Used in:
 * - AnimatedTabBar (Cart tab)
 * - CartScreen (Empty state)
 * 
 * DO NOT duplicate this icon definition elsewhere.
 */
export const CartIcon = ({ size, color }: Props) => {
  return (
    <MaterialCommunityIcons
      name="cart-outline"
      size={size}
      color={color}
    />
  );
};

export default CartIcon;

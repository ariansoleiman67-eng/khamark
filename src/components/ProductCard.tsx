import React from "react";
import { ViewStyle, StyleProp } from "react-native";
import { Product } from "../types";
import MasonryProductCard from "./MasonryProductCard";

export interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onAddToCart?: () => void;
  variant?: "default" | "compact" | "featured";
  showAddToCart?: boolean;
  style?: StyleProp<ViewStyle>;
  cardWidth?: number;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  onAddToCart,
  style,
  cardWidth,
}) => {
  return (
    <MasonryProductCard
      product={product}
      onPress={() => onPress()}
      onAddToCart={onAddToCart ? () => onAddToCart() : undefined}
      style={style}
      cardWidth={cardWidth}
    />
  );
};

export default React.memo(ProductCard);

/**
 * Store Products Screen
 * 
 * Browse all products from a specific store (tenant).
 * Accessed via "View Store" button on ProductDetails.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../components/ThemeProvider';
import { RootStackParamList, Product } from '../types';
import { storeProfileService, StoreProfile } from '../services/storeProfileService';
import ProductService from '../services/productService';
import StoreHero from '../components/StoreHero';
import StoreHomeTab from './store/StoreHomeTab';
import StoreProductsTab from './store/StoreProductsTab';
import StoreCompanyTab from './store/StoreCompanyTab';

type StoreProductsRouteProp = RouteProp<RootStackParamList, 'StoreProducts'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const Tab = createMaterialTopTabNavigator();

const StoreProductsScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const route = useRoute<StoreProductsRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { tenantId } = route.params;

  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const [profile, products] = await Promise.all([
        storeProfileService.getStoreProfile(tenantId),
        ProductService.getProductsByTenantId(tenantId),
      ]);
      
      setStoreProfile(profile);
      setProducts(products || []);
      setProductCount(products ? products.filter(p => p.isActive !== false).length : 0);
    } catch (error) {
      console.error('Error loading store data:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);
  


  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // A failed fetch is not an empty store: say so, and offer a way back in.
  if (loadError && !storeProfile) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.colors.text }]}>
          {t('errors.network')}
        </Text>
        <TouchableOpacity onPress={loadData} style={[styles.retryButton, { backgroundColor: theme.colors.primary }]}>
          <Text allowFontScaling={false} style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!storeProfile) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <Text allowFontScaling={false} style={{ color: theme.colors.text }}>{t('errors.loadProfileFailed', 'Store not found')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StoreHero profile={storeProfile} productCount={productCount} tenantId={tenantId} />
      
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: { 
            backgroundColor: isDark ? theme.colors.surface : '#fff',
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
            paddingTop: 4,
          },
          tabBarLabelStyle: {
            fontWeight: '700',
            textTransform: 'none',
            fontSize: 14,
            letterSpacing: 0.3,
          },
          tabBarIndicatorStyle: {
            backgroundColor: '#667eea',
            height: 3,
            borderRadius: 2,
            marginBottom: 0,
          },
          tabBarActiveTintColor: '#667eea',
          tabBarInactiveTintColor: theme.colors.textSecondary,
          tabBarPressColor: isDark ? 'rgba(102,126,234,0.15)' : 'rgba(102,126,234,0.1)',
          tabBarItemStyle: {
            paddingVertical: 8,
          },
        }}
      >
        <Tab.Screen 
          name="StoreHome" 
          options={{ title: t('store.home', 'Home') }}
        >
          {({ navigation }: { navigation: any }) => (
            <StoreHomeTab 
              profile={storeProfile} 
              tenantId={tenantId} 
              products={products} 
              onSwitchTab={(tabName) => navigation.navigate(tabName)} 
            />
          )}
        </Tab.Screen>
        
        <Tab.Screen 
          name="ProductsTab" 
          options={{ title: t('common.products', 'Products') }}
        >
          {() => <StoreProductsTab profile={storeProfile} tenantId={tenantId} products={products} />}
        </Tab.Screen>
        
        <Tab.Screen 
          name="StoreCompany" 
          options={{ title: t('store.company', 'Company') }}
        >
          {() => <StoreCompanyTab profile={storeProfile} />}
        </Tab.Screen>
      </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorText: {
    marginBottom: 16,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  retryButton: {
    borderRadius: 999,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default StoreProductsScreen;

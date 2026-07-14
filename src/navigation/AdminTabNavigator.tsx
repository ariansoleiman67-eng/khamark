import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { AdminTabParamList } from '../types';
import AdminAnimatedTabBar from '../components/AdminAnimatedTabBar';

// Admin Screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminOrdersScreen from '../screens/admin/AdminOrdersScreen';
import AdminProductsScreen from '../screens/admin/AdminProductsScreen';
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen';

import AdminInboxScreen from '../screens/admin/AdminInboxScreen';

const Tab = createBottomTabNavigator<AdminTabParamList>();

// Screen wrapper with SafeAreaView — 'top' handled by each screen's own paddingTop
const ScreenWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SafeAreaView 
      style={styles.screenWrapper}
      edges={['left', 'right']} // top handled by each screen internally, bottom handled by tab bar
    >
      {children}
    </SafeAreaView>
  );
};

// Wrapped screen components to handle safe area and floating tab bar
const WrappedDashboardScreen = () => (
  <ScreenWrapper>
    <AdminDashboardScreen />
  </ScreenWrapper>
);

const WrappedOrdersScreen = () => (
  <ScreenWrapper>
    <AdminOrdersScreen />
  </ScreenWrapper>
);

const WrappedProductsScreen = () => (
  <ScreenWrapper>
    <AdminProductsScreen />
  </ScreenWrapper>
);



const WrappedInboxScreen = () => (
  <ScreenWrapper>
    <AdminInboxScreen />
  </ScreenWrapper>
);

const WrappedSettingsScreen = () => (
  <ScreenWrapper>
    <AdminSettingsScreen />
  </ScreenWrapper>
);

const AdminTabNavigator: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      tabBar={(props) => <AdminAnimatedTabBar {...props} />}
      screenOptions={{
        freezeOnBlur: true,
        headerTransparent: true,
        headerStyle: { backgroundColor: isDark ? 'rgba(18,18,18,0.85)' : 'rgba(255,255,255,0.85)' },
        headerTitleStyle: { color: theme.colors.text, fontSize: 18, fontWeight: '600' },
        headerTintColor: theme.colors.text,
        ...(Platform.OS === 'android' && { headerStatusBarHeight: 44 }),
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          height: 0,
        },
      }}
    >
      <Tab.Screen
        name="AdminDashboard"
        component={WrappedDashboardScreen}
        options={{
          tabBarLabel: t('admin.tabs.dashboard', 'Dashboard'),
          headerTitle: t('admin.tabs.dashboard', 'Dashboard'),
        }}
      />
      <Tab.Screen
        name="AdminOrders"
        component={WrappedOrdersScreen}
        options={{
          tabBarLabel: t('admin.tabs.orders', 'Orders'),
          headerTitle: t('admin.tabs.orders', 'Orders'),
        }}
      />
      <Tab.Screen
        name="AdminProducts"
        component={WrappedProductsScreen}
        options={{
          tabBarLabel: t('admin.tabs.products', 'Products'),
          headerTitle: t('admin.tabs.products', 'Products'),
        }}
      />

      <Tab.Screen
        name="AdminConversations"
        component={WrappedInboxScreen}
        options={{
          tabBarLabel: t('admin.tabs.messages', 'Messages'),
          headerTitle: t('admin.tabs.messages', 'Messages'),
        }}
      />

      <Tab.Screen
        name="AdminSettings"
        component={WrappedSettingsScreen}
        options={{
          tabBarLabel: t('admin.tabs.settings', 'Settings'),
          headerTitle: t('admin.tabs.settings', 'Settings'),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
  },
});

export default AdminTabNavigator;

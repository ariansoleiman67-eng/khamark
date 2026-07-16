import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Platform, StatusBar as RNStatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';


import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '../contexts/AuthContext';
import AnimatedTabBar from '../components/AnimatedTabBar';
import ScreenWrapper from '../components/ScreenWrapper';
import Logo from '../components/Logo';
import PushInitializer from '../components/PushInitializer';

import ErrorBoundary from '../components/ErrorBoundary';


// Auth Screens
import SignInScreen from '../screens/auth/SignInScreen';
import PasswordScreen from '../screens/auth/PasswordScreen';
import PhoneLoginScreen from '../screens/auth/PhoneLoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import LoginGateScreen from '../screens/auth/LoginGateScreen';
import AdminSignupScreen from '../screens/admin/AdminSignupScreen';
import PartnerSignupScreen from '../screens/auth/PartnerSignupScreen';
import AdminStoreNameScreen from '../screens/admin/AdminStoreNameScreen';
import AdminDetailsScreen from '../screens/admin/AdminDetailsScreen';
import AdminSecurityScreen from '../screens/admin/AdminSecurityScreen';
import AdminSuccessScreen from '../screens/admin/AdminSuccessScreen';
import AdminVerifyEmailScreen from '../screens/admin/AdminVerifyEmailScreen';
import VerifyPhoneScreen from '../screens/auth/VerifyPhoneScreen';
import SetNewPasswordScreen from '../screens/auth/SetNewPasswordScreen';
import AboutYouScreen from '../screens/auth/AboutYouScreen';
import RegisterSuccessScreen from '../screens/auth/RegisterSuccessScreen';
import LegacyEmailLoginScreen from '../screens/auth/LegacyEmailLoginScreen';
// AsyncStorage removed - no longer needed for welcome screen

// Main Screens
import HomeScreen from '../screens/main/HomeScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import CartScreen from '../screens/CartScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderConfirmationScreen from '../screens/OrderConfirmationScreen';
import QiCardPaymentScreen from '../screens/QiCardPaymentScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProductDetailsScreen from '../screens/ProductDetailsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import SearchScreen from '../screens/SearchScreen';
import BarcodeScannerScreen from '../screens/BarcodeScannerScreen';
import StoreProductsScreen from '../screens/StoreProductsScreen';

// Profile Screens
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import MyAddressScreen from '../screens/profile/MyAddressScreen';
import AddEditAddressScreen from '../screens/profile/AddEditAddressScreen';
import PaymentMethodsScreen from '../screens/profile/PaymentMethodsScreen';
import HelpSupportScreen from '../screens/profile/HelpSupportScreen';
import ChatbotScreen from '../screens/ChatbotScreen';
import MessengerStack from './MessengerStack';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import StoreLocationScreen from '../screens/StoreLocationScreen';
import TermsAndConditionsScreen from '../screens/profile/TermsAndConditionsScreen';
import PrivacyPolicyScreen from '../screens/profile/PrivacyPolicyScreen';
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';
import AccountSecurityScreen from '../screens/profile/AccountSecurityScreen';
import ConfirmIdentityScreen from '../screens/profile/ConfirmIdentityScreen';
import UpdateEmailScreen from '../screens/profile/UpdateEmailScreen';
import UpdatePhoneScreen from '../screens/profile/UpdatePhoneScreen';
import ShippingInfoScreen from '../screens/profile/ShippingInfoScreen';
import ThemeCustomizationScreen from '../screens/ThemeCustomizationScreen';
import CategoryProductsScreen from '../screens/CategoryProductsScreen';

import { RootStackParamList, MainTabParamList } from '../types';

// Admin Navigator
import AdminTabNavigator from './AdminTabNavigator';
import AdminSendNotificationScreen from '../screens/admin/AdminSendNotificationScreen';
import AdminBusinessInfoScreen from '../screens/admin/AdminBusinessInfoScreen';
import AdminCurrencySettingsScreen from '../screens/admin/AdminCurrencySettingsScreen';
import AdminOperatingHoursScreen from '../screens/admin/AdminOperatingHoursScreen';
import AdminStockReportScreen from '../screens/admin/AdminStockReportScreen';

import AdminAnalyticsScreen from '../screens/admin/AdminAnalyticsScreen';
import AdminChangePasswordScreen from '../screens/admin/AdminChangePasswordScreen';
import AdminAccountSecurityScreen from '../screens/admin/AdminAccountSecurityScreen';
import AdminStoreLocationsScreen from '../screens/admin/AdminStoreLocationsScreen';
import AdminEditStoreLocationScreen from '../screens/admin/AdminEditStoreLocationScreen';
import AdminDiscountsScreen from '../screens/admin/AdminDiscountsScreen';
import AdminCategoriesScreen from '../screens/admin/AdminCategoriesScreen';
import AdminEditDiscountScreen from '../screens/admin/AdminEditDiscountScreen';
import AdminConversationsListScreen from '../screens/admin/AdminConversationsListScreen';
import AdminStoreProfileScreen from '../screens/admin/AdminStoreProfileScreen';
import AdminInvoiceSettingsScreen from '../screens/admin/AdminInvoiceSettingsScreen';
import AdminChatScreen from '../screens/admin/AdminChatScreen';
import AdminBannerScreen from '../screens/admin/AdminBannerScreen';
import AdminBrandManagerScreen from '../screens/admin/AdminBrandManagerScreen';
import { USE_MOCK_DATA } from '../services/mockData';
import AdminCategoryManagerScreen from '../screens/admin/AdminCategoryManagerScreen';
import AdminCustomersScreen from '../screens/admin/AdminCustomersScreen';
import AdminPartnerManagementScreen from '../screens/admin/AdminPartnerManagementScreen';
import AdminPartnerAssignmentScreen from '../screens/admin/AdminPartnerAssignmentScreen';
import AdminPartnerDashboardScreen from '../screens/admin/AdminPartnerDashboardScreen';
import AdminOrdersScreen from '../screens/admin/AdminOrdersScreen';
import AdminCreateOrderScreen from '../screens/admin/AdminCreateOrderScreen';

// Chat Screens
import ChatScreen from '../screens/ChatScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Note: AuthNavigator removed for Guest Login System
// Auth screens (Login, Register, etc.) are now in main stack
// to allow intent-based navigation from guest mode

// Wrapped screen components to handle floating tab bar padding
const WrappedHomeScreen = () => (
  <ScreenWrapper>
    <HomeScreen />
  </ScreenWrapper>
);

const WrappedCategoriesScreen = () => (
  <ScreenWrapper>
    <CategoriesScreen />
  </ScreenWrapper>
);

const WrappedCartScreen = () => (
  <ScreenWrapper>
    <CartScreen />
  </ScreenWrapper>
);

const WrappedOrdersScreen = () => (
  <ScreenWrapper>
    <OrdersScreen />
  </ScreenWrapper>
);

const WrappedChatbotScreen = () => (
  <ScreenWrapper>
    <ChatbotScreen />
  </ScreenWrapper>
);

const WrappedProfileScreen = () => (
  <ScreenWrapper>
    <ProfileScreen />
  </ScreenWrapper>
);

const TabNavigator = () => {
  const { theme, isDark } = useTheme();
  const { isGuest } = useAuth();
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: theme.colors.background },
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTitleStyle: {
          color: theme.colors.text,
          fontSize: 18,
          fontWeight: '600',
        },
        headerTintColor: theme.colors.text,
        tabBarHideOnKeyboard: true,
        // Add bottom padding to prevent content from being hidden by floating tab bar
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          height: 0, // Make native tab bar invisible
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={WrappedHomeScreen}
        options={{
          tabBarLabel: t('nav.home', 'Home'),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Categories"
        component={WrappedCategoriesScreen}
        options={{
          tabBarLabel: t('nav.categories', 'Categories'),
          headerTitle: t('nav.categories', 'Categories'),
          headerTransparent: true,
          headerStyle: { 
            backgroundColor: isDark ? 'rgba(18,18,18,0.85)' : 'rgba(255,255,255,0.85)',
            ...(Platform.OS === 'android' && { height: (RNStatusBar.currentHeight || 34) + 56 }),
          },
          headerTitleStyle: { color: theme.colors.text, fontSize: 18, fontWeight: '600' },
          headerStatusBarHeight: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : undefined,
        }}
      />
      <Tab.Screen
        name="Cart"
        component={WrappedCartScreen}
        options={{
          tabBarLabel: t('nav.cart', 'Cart'),
          headerTitle: t('cart.title', 'Shopping Cart'),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="MessagesTab"
        component={MessengerStack}
        options={({ route }) => {
          // Hide tab bar when in ChatThread
          const routeName = getFocusedRouteNameFromRoute(route) ?? '';
          return {
            tabBarLabel: t('nav.messages', 'Messages'),
            headerShown: false,
            tabBarStyle: routeName === 'ChatThread' ? { display: 'none' } : undefined,
          };
        }}
      />
      {/* GUEST LOGIN SYSTEM: Hide Orders tab for guests */}
      {!isGuest && (
        <Tab.Screen
          name="Orders"
          component={WrappedOrdersScreen}
          options={{
            tabBarLabel: t('nav.orders', 'Orders'),
            headerTitle: t('orders.title', 'My Orders'),
            headerTransparent: true,
            headerStyle: { 
              backgroundColor: isDark ? 'rgba(18,18,18,0.85)' : 'rgba(255,255,255,0.85)',
              ...(Platform.OS === 'android' && { height: (RNStatusBar.currentHeight || 34) + 52 }),
            },
            headerTitleStyle: { color: theme.colors.text, fontSize: 18, fontWeight: '600' },
            headerStatusBarHeight: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 34) : undefined,
          }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={WrappedProfileScreen}
        options={{
          tabBarLabel: t('nav.profile', 'Profile'),
          headerTitle: t('profile.title', 'My Profile'),
          headerTransparent: true,
          headerStyle: { 
            backgroundColor: isDark ? 'rgba(18,18,18,0.85)' : 'rgba(255,255,255,0.85)',
            ...(Platform.OS === 'android' && { height: (RNStatusBar.currentHeight || 34) + 56 }),
          },
          headerTitleStyle: { color: theme.colors.text, fontSize: 18, fontWeight: '600' },
          headerStatusBarHeight: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : undefined,
        }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator: React.FC = () => {
  const { theme } = useTheme();
  const { user, isLoading, isAdmin, isPartner } = useAuth();
  // Welcome screen logic removed

  // Build a navigation theme that uses the app's background color
  const navigationTheme = useMemo(() => ({
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.primary,
    },
  }), [theme]);

  const linking = React.useMemo(() => ({
    prefixes: ['https://ASANKARY_DOMAIN_TBD', 'https://www.ASANKARY_DOMAIN_TBD', 'asankary://'],
    config: {
      screens: {
        ProductDetails: 'product/:productId',
      },
    },
  }), []);

  if (isLoading) {
    /* eslint-disable react-native/no-inline-styles */
    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.background
      }}>
        <Logo
          size={120}
          style={{ marginBottom: 32 }}
        />
        <Text allowFontScaling={false} 
          style={{
            fontSize: 28,
            fontWeight: 'bold',
            color: theme.colors.text,
            marginBottom: 8,
            textAlign: 'center'
          }}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          Asankary
        </Text>
        <Text allowFontScaling={false} 
          style={{
            fontSize: 16,
            color: theme.colors.textSecondary,
            marginBottom: 24,
            textAlign: 'center',
            includeFontPadding: false,
            textAlignVertical: 'center',
            paddingHorizontal: 10,
          }}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          Loading...
        </Text>
      </View>
    );
  }

  // VIEW-ONLY PARTNER: a read-only home showing only the products an owner shared with
  // them (partners are is_admin=false, so they never enter the admin stack below).
  if (user && isPartner) {
    return (
      <ErrorBoundary>
        <NavigationContainer theme={navigationTheme} linking={linking}>
          <PushInitializer />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main" component={AdminPartnerDashboardScreen} />
            <Stack.Screen name="AdminPartnerDashboard" component={AdminPartnerDashboardScreen} />
            <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
            <Stack.Screen name="ChatScreen" component={ChatScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>
    );
  }

  // GUEST LOGIN SYSTEM: Admin users still get admin navigation
  if (user && isAdmin) {
    return (
      <ErrorBoundary>
        <NavigationContainer theme={navigationTheme} linking={linking}>
          <PushInitializer />
          <Stack.Navigator 
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Main" component={AdminTabNavigator} />
            <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
            <Stack.Screen name="AdminSendNotification" component={AdminSendNotificationScreen} />
            <Stack.Screen name="AdminBusinessInfo" component={AdminBusinessInfoScreen} />
            <Stack.Screen name="AdminCurrencySettings" component={AdminCurrencySettingsScreen} />
            <Stack.Screen name="AdminOperatingHours" component={AdminOperatingHoursScreen} />

            <Stack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} />
            <Stack.Screen name="AdminStockReport" component={AdminStockReportScreen} />
            <Stack.Screen name={"AdminChangePassword" as any} component={AdminChangePasswordScreen} />
            <Stack.Screen name={"AdminAccountSecurity" as any} component={AdminAccountSecurityScreen} />
            <Stack.Screen name={"UpdateEmail" as any} component={UpdateEmailScreen} />
            <Stack.Screen name={"UpdatePhone" as any} component={UpdatePhoneScreen} />
            <Stack.Screen name={"ChangePassword" as any} component={ChangePasswordScreen} />
            <Stack.Screen name="AdminStoreLocations" component={AdminStoreLocationsScreen} />
            <Stack.Screen name="AdminEditStoreLocation" component={AdminEditStoreLocationScreen} />
            <Stack.Screen name="AdminDiscounts" component={AdminDiscountsScreen} />
            <Stack.Screen name={"AdminCategories" as any} component={AdminCategoriesScreen} />
            <Stack.Screen name="AdminEditDiscount" component={AdminEditDiscountScreen} />
            <Stack.Screen name="AdminConversationsListScreen" component={AdminConversationsListScreen} />
            <Stack.Screen name="AdminStoreProfile" component={AdminStoreProfileScreen} />
            <Stack.Screen name="ChatScreen" component={ChatScreen} />
            <Stack.Screen name="AdminChatScreen" component={AdminChatScreen} />
            <Stack.Screen name="ThemeCustomization" component={ThemeCustomizationScreen} />
            <Stack.Screen name="AdminInvoiceSettings" component={AdminInvoiceSettingsScreen} />
            <Stack.Screen name="AdminCustomers" component={AdminCustomersScreen} />
            <Stack.Screen name="AdminBannerManagement" component={AdminBannerScreen} />
            <Stack.Screen name="AdminBrandManagement" component={AdminBrandManagerScreen} />
            <Stack.Screen name="AdminCategoryManagement" component={AdminCategoryManagerScreen} />
            <Stack.Screen name="AdminPartnerManagement" component={AdminPartnerManagementScreen} />
            <Stack.Screen name="AdminPartnerAssignment" component={AdminPartnerAssignmentScreen} />
            <Stack.Screen name="AdminPartnerDashboard" component={AdminPartnerDashboardScreen} />
            <Stack.Screen name="AdminInStoreOrders" component={AdminOrdersScreen} initialParams={{ source: 'in-store' }} />
            <Stack.Screen name="AdminCreateOrder" component={AdminCreateOrderScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>
    );
  }

  // GUEST LOGIN SYSTEM: Always show main app (guest mode default)
  // Auth is handled via intent-based triggers (useAuthGate hook)
  return (
    <ErrorBoundary>
      <NavigationContainer theme={navigationTheme} linking={linking}>
        <PushInitializer />

        <Stack.Navigator 
          screenOptions={{ headerShown: false }}
        >

        {/* Main App - Always accessible (guest mode) */}
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
        <Stack.Screen name="StoreProducts" component={StoreProductsScreen} />
        <Stack.Screen name="Favorites" component={FavoritesScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Cart" component={CartScreen} />
        <Stack.Screen name="StoreLocation" component={StoreLocationScreen} />
        <Stack.Screen name="ThemeCustomization" component={ThemeCustomizationScreen} />
        <Stack.Screen name="CategoryProducts" component={CategoryProductsScreen} />
        
        {/* Auth Screens - Accessible for intent-based login */}
        <Stack.Screen name="LoginGate" component={LoginGateScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Password" component={PasswordScreen} />
        <Stack.Screen name="Login" component={PhoneLoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="VerifyPhone" component={VerifyPhoneScreen} />
        <Stack.Screen name="SetNewPassword" component={SetNewPasswordScreen} />
        <Stack.Screen name="AboutYou" component={AboutYouScreen} />
        <Stack.Screen name="RegisterSuccess" component={RegisterSuccessScreen} />
        <Stack.Screen name="LegacyEmailLogin" component={LegacyEmailLoginScreen} />
        <Stack.Screen name="AdminSignup" component={AdminSignupScreen} />
        <Stack.Screen name="PartnerSignup" component={PartnerSignupScreen} />
        <Stack.Screen name="AdminVerifyEmail" component={AdminVerifyEmailScreen} />
        <Stack.Screen name="AdminStoreName" component={AdminStoreNameScreen} />
        <Stack.Screen name="AdminDetails" component={AdminDetailsScreen} />
        <Stack.Screen name="AdminSecurity" component={AdminSecurityScreen} />
        <Stack.Screen name="AdminSuccess" component={AdminSuccessScreen} />

        {/* Protected Screens - Require authentication */}
        {/* Note: Actual protection is via useAuthGate hook, not route blocking */}
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
        <Stack.Screen name="QiCardPayment" component={QiCardPaymentScreen} options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />

        {/* Profile Screens */}
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="MyAddress" component={MyAddressScreen} />
        <Stack.Screen name="AddEditAddress" component={AddEditAddressScreen} />
        <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
        <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
        <Stack.Screen name="Chatbot" component={ChatbotScreen} />
        <Stack.Screen name="TermsAndConditions" component={TermsAndConditionsScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name={"ChangePassword" as any} component={ChangePasswordScreen} />
        <Stack.Screen name="AccountSecurity" component={AccountSecurityScreen} />
        <Stack.Screen name="ConfirmIdentity" component={ConfirmIdentityScreen} />
        <Stack.Screen name="UpdateEmail" component={UpdateEmailScreen} />
        <Stack.Screen name="UpdatePhone" component={UpdatePhoneScreen} />
        <Stack.Screen name="ShippingInfo" component={ShippingInfoScreen} />
        
        {/* Chat Screens */}
        <Stack.Screen name="ChatScreen" component={ChatScreen} />

        {/* Demo-only: brand/category managers reachable from Profile in offline mock mode */}
        {USE_MOCK_DATA && (
          <>
            <Stack.Screen name="AdminBrandManagement" component={AdminBrandManagerScreen} />
            <Stack.Screen name="AdminCategoryManagement" component={AdminCategoryManagerScreen} />
          </>
        )}
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
};

export default AppNavigator;

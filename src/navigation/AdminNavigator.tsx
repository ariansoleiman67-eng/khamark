import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import PushInitializer from '../components/PushInitializer';

// Screens shared with the customer stack.
import ProductDetailsScreen from '../screens/ProductDetailsScreen';
import ChatScreen from '../screens/ChatScreen';
import ThemeCustomizationScreen from '../screens/ThemeCustomizationScreen';
import UpdateEmailScreen from '../screens/profile/UpdateEmailScreen';
import UpdatePhoneScreen from '../screens/profile/UpdatePhoneScreen';
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';

// Admin-only screens. These live here (rather than in AppNavigator) so that the
// whole admin surface — roughly 1.3 MB of JS including the product editor, orders,
// and report generators — is a lazily-loaded chunk instead of something every
// guest parses before the storefront can paint.
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
import AdminCategoryManagerScreen from '../screens/admin/AdminCategoryManagerScreen';
import AdminPromoManagerScreen from '../screens/admin/AdminPromoManagerScreen';
import AdminCustomersScreen from '../screens/admin/AdminCustomersScreen';
import AdminPartnerManagementScreen from '../screens/admin/AdminPartnerManagementScreen';
import AdminPartnerAssignmentScreen from '../screens/admin/AdminPartnerAssignmentScreen';
import AdminPartnerDashboardScreen from '../screens/admin/AdminPartnerDashboardScreen';
import AdminOrdersScreen from '../screens/admin/AdminOrdersScreen';
import AdminCreateOrderScreen from '../screens/admin/AdminCreateOrderScreen';

const Stack = createNativeStackNavigator<any>();

interface Props {
  navigationTheme: any;
  linking: any;
}

/**
 * The admin navigation stack, extracted verbatim from AppNavigator so it can be
 * code-split. Screen names, order and options are unchanged.
 */
const AdminNavigator: React.FC<Props> = ({ navigationTheme, linking }) => (
  <NavigationContainer theme={navigationTheme} linking={linking}>
    <PushInitializer />
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={AdminTabNavigator} />
      <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
      <Stack.Screen name="AdminSendNotification" component={AdminSendNotificationScreen} />
      <Stack.Screen name="AdminBusinessInfo" component={AdminBusinessInfoScreen} />
      <Stack.Screen name="AdminCurrencySettings" component={AdminCurrencySettingsScreen} />
      <Stack.Screen name="AdminOperatingHours" component={AdminOperatingHoursScreen} />

      <Stack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} />
      <Stack.Screen name="AdminStockReport" component={AdminStockReportScreen} />
      <Stack.Screen name="AdminChangePassword" component={AdminChangePasswordScreen} />
      <Stack.Screen name="AdminAccountSecurity" component={AdminAccountSecurityScreen} />
      <Stack.Screen name="UpdateEmail" component={UpdateEmailScreen} />
      <Stack.Screen name="UpdatePhone" component={UpdatePhoneScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="AdminStoreLocations" component={AdminStoreLocationsScreen} />
      <Stack.Screen name="AdminEditStoreLocation" component={AdminEditStoreLocationScreen} />
      <Stack.Screen name="AdminDiscounts" component={AdminDiscountsScreen} />
      <Stack.Screen name="AdminCategories" component={AdminCategoriesScreen} />
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
      <Stack.Screen name="AdminPromoManagement" component={AdminPromoManagerScreen} />
      <Stack.Screen name="AdminPartnerManagement" component={AdminPartnerManagementScreen} />
      <Stack.Screen name="AdminPartnerAssignment" component={AdminPartnerAssignmentScreen} />
      <Stack.Screen name="AdminPartnerDashboard" component={AdminPartnerDashboardScreen} />
      <Stack.Screen name="AdminInStoreOrders" component={AdminOrdersScreen} initialParams={{ source: 'in-store' }} />
      <Stack.Screen name="AdminCreateOrder" component={AdminCreateOrderScreen} />
    </Stack.Navigator>
  </NavigationContainer>
);

export default AdminNavigator;

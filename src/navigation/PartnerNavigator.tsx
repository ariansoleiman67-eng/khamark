import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import PushInitializer from '../components/PushInitializer';
import ProductDetailsScreen from '../screens/ProductDetailsScreen';
import ChatScreen from '../screens/ChatScreen';
import AdminPartnerDashboardScreen from '../screens/admin/AdminPartnerDashboardScreen';

const Stack = createNativeStackNavigator<any>();

interface Props {
  navigationTheme: any;
  linking: any;
}

/**
 * View-only partner stack: a read-only home showing only the products an owner
 * shared with them (partners are is_admin=false, so they never enter the admin
 * stack). Split out of AppNavigator so the partner dashboard — and the admin
 * service layer it pulls in — is not parsed during a normal customer's startup.
 */
const PartnerNavigator: React.FC<Props> = ({ navigationTheme, linking }) => (
  <NavigationContainer theme={navigationTheme} linking={linking}>
    <PushInitializer />
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={AdminPartnerDashboardScreen} />
      <Stack.Screen name="AdminPartnerDashboard" component={AdminPartnerDashboardScreen} />
      <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
      <Stack.Screen name="ChatScreen" component={ChatScreen} />
    </Stack.Navigator>
  </NavigationContainer>
);

export default PartnerNavigator;

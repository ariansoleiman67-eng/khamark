import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConversationsScreen from '../screens/messenger/ConversationsScreen';
import ChatThreadScreen from '../screens/messenger/ChatThreadScreen';

export type MessengerStackParamList = {
  Conversations: undefined;
  ChatThread: { conversationId: string; title?: string };
};

const Stack = createNativeStackNavigator<MessengerStackParamList>();

export default function MessengerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Conversations" component={ConversationsScreen} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
    </Stack.Navigator>
  );
}

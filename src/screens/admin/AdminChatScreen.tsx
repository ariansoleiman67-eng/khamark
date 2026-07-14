import React from 'react';
import ChatScreen from '../ChatScreen';

const AdminChatScreen = (props: any) => {
  return <ChatScreen {...props} isAdminView={true} />;
};

export default AdminChatScreen;

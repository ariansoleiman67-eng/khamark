import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { imageEditorBus } from '../services/imageEditorBus';
import { ImageEditorScreen } from './ImageEditorScreen';

export function ImageEditorModal() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  
  // Keep the reference mapping to the current active Promise resolution
  const [resolver, setResolver] = useState<{ resolve: (uri: string | null) => void } | null>(null);

  useEffect(() => {
    const unsubscribe = imageEditorBus.subscribe((request) => {
      // If one is already open, auto-cancel it to prevent hanging promises
      if (resolver) {
        resolver.resolve(currentUri); 
      }

      setCurrentUri(request.uri);
      setResolver({ resolve: request.resolve });
      setIsVisible(true);
    });

    return () => unsubscribe();
  }, [resolver, currentUri]);

  const handleClose = useCallback((resultUri: string | null) => {
    setIsVisible(false);
    if (resolver) {
      // Provide a tiny delay so the modal animation finishes before we resolve,
      // as resolving often triggers heavy navigation or state updates in ChatScreen.
      setTimeout(() => {
        resolver.resolve(resultUri);
      }, Platform.OS === 'ios' ? 300 : 100);
      setResolver(null);
    }
  }, [resolver]);

  const handleSave = useCallback((editedUri: string) => {
    handleClose(editedUri);
  }, [handleClose]);

  const handleDiscard = useCallback(() => {
    handleClose(currentUri); // Return original
  }, [handleClose, currentUri]);

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleDiscard} // Hardware back button
    >
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        {isVisible && currentUri && (
          <ImageEditorScreen
            uri={currentUri}
            onSave={handleSave}
            onDiscard={handleDiscard}
          />
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const FAVORITES_STORAGE_KEY = '@asankary_favorites';

interface FavoritesContextType {
  favorites: string[];
  isFavorite: (productId: string) => boolean;
  toggleFavorite: (productId: string) => Promise<void>;
  addToFavorites: (productId: string) => Promise<void>;
  removeFromFavorites: (productId: string) => Promise<void>;
  clearFavorites: () => Promise<void>;
  favoritesCount: number;
  isLoading: boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};

interface FavoritesProviderProps {
  children: React.ReactNode;
}

export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({ children }) => {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Get storage key based on user (so different users have different favorites)
  const getStorageKey = useCallback(() => {
    return user?.uid 
      ? `${FAVORITES_STORAGE_KEY}_${user.uid}` 
      : `${FAVORITES_STORAGE_KEY}_guest`;
  }, [user?.uid]);

  // Load favorites from storage on mount and when user changes
  useEffect(() => {
    loadFavorites();
  }, [user?.uid]);

  const loadFavorites = async () => {
    try {
      setIsLoading(true);
      const storageKey = getStorageKey();
      const storedFavorites = await AsyncStorage.getItem(storageKey);
      
      if (storedFavorites) {
        const parsed = JSON.parse(storedFavorites);
        if (Array.isArray(parsed)) {
          setFavorites(parsed);
        }
      } else {
        setFavorites([]);
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
      setFavorites([]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveFavorites = async (newFavorites: string[]) => {
    try {
      const storageKey = getStorageKey();
      await AsyncStorage.setItem(storageKey, JSON.stringify(newFavorites));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  };

  const isFavorite = useCallback((productId: string): boolean => {
    return favorites.includes(productId);
  }, [favorites]);

  const addToFavorites = useCallback(async (productId: string) => {
    if (!favorites.includes(productId)) {
      const newFavorites = [...favorites, productId];
      setFavorites(newFavorites);
      await saveFavorites(newFavorites);
    }
  }, [favorites, getStorageKey]);

  const removeFromFavorites = useCallback(async (productId: string) => {
    const newFavorites = favorites.filter(id => id !== productId);
    setFavorites(newFavorites);
    await saveFavorites(newFavorites);
  }, [favorites, getStorageKey]);

  const toggleFavorite = useCallback(async (productId: string) => {
    if (favorites.includes(productId)) {
      await removeFromFavorites(productId);
    } else {
      await addToFavorites(productId);
    }
  }, [favorites, addToFavorites, removeFromFavorites]);

  const clearFavorites = useCallback(async () => {
    setFavorites([]);
    await saveFavorites([]);
  }, [getStorageKey]);

  const value: FavoritesContextType = React.useMemo(() => ({
    favorites,
    isFavorite,
    toggleFavorite,
    addToFavorites,
    removeFromFavorites,
    clearFavorites,
    favoritesCount: favorites.length,
    isLoading,
  }), [
    favorites,
    isFavorite,
    toggleFavorite,
    addToFavorites,
    removeFromFavorites,
    clearFavorites,
    isLoading
  ]);

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};

export default FavoritesContext;

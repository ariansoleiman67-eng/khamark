import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const FAVORITES_STORAGE_KEY = '@khamark_favorites';

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

  // Synchronous mirror of `favorites`. React state updates are async/batched,
  // so back-to-back mutations (e.g. two hearts tapped in one frame) would each
  // read the same stale `favorites` and clobber one another. Reading/writing
  // this ref makes the next-state computation synchronous and race-free.
  const favoritesRef = useRef<string[]>([]);

  // Get storage key based on user (so different users have different favorites)
  const getStorageKey = useCallback(() => {
    return user?.uid 
      ? `${FAVORITES_STORAGE_KEY}_${user.uid}` 
      : `${FAVORITES_STORAGE_KEY}_guest`;
  }, [user?.uid]);

  // Persist favorites under the current user's storage key.
  const saveFavorites = useCallback(async (newFavorites: string[]) => {
    try {
      const storageKey = getStorageKey();
      await AsyncStorage.setItem(storageKey, JSON.stringify(newFavorites));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  }, [getStorageKey]);

  // Update the synchronous ref and React state together so they never diverge.
  const applyFavorites = useCallback((next: string[]) => {
    favoritesRef.current = next;
    setFavorites(next);
  }, []);

  // Load favorites from storage on mount and when the user changes. Reset
  // synchronously so the previous account's favorites can't linger in state
  // (privacy leak) or be written under the new user's key during the async
  // read window. `active` drops a stale read if the user changes again before
  // it resolves.
  useEffect(() => {
    let active = true;
    favoritesRef.current = [];
    setFavorites([]);
    setIsLoading(true);
    const storageKey = getStorageKey();
    (async () => {
      try {
        const storedFavorites = await AsyncStorage.getItem(storageKey);
        if (!active) return;
        if (storedFavorites) {
          const parsed = JSON.parse(storedFavorites);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter(
              (x: unknown): x is string => typeof x === 'string'
            );
            favoritesRef.current = cleaned;
            setFavorites(cleaned);
          }
        }
      } catch (error) {
        console.error('Error loading favorites:', error);
        if (active) {
          favoritesRef.current = [];
          setFavorites([]);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.uid, getStorageKey]);

  const isFavorite = useCallback((productId: string): boolean => {
    return favorites.includes(productId);
  }, [favorites]);

  const addToFavorites = useCallback(async (productId: string) => {
    // Read the synchronous ref (not the possibly-stale `favorites` state) so
    // rapid successive adds each build on the latest list instead of clobbering.
    if (favoritesRef.current.includes(productId)) {
      return;
    }
    const newFavorites = [...favoritesRef.current, productId];
    applyFavorites(newFavorites);
    await saveFavorites(newFavorites);
  }, [applyFavorites, saveFavorites]);

  const removeFromFavorites = useCallback(async (productId: string) => {
    const newFavorites = favoritesRef.current.filter(id => id !== productId);
    applyFavorites(newFavorites);
    await saveFavorites(newFavorites);
  }, [applyFavorites, saveFavorites]);

  const toggleFavorite = useCallback(async (productId: string) => {
    if (favoritesRef.current.includes(productId)) {
      await removeFromFavorites(productId);
    } else {
      await addToFavorites(productId);
    }
  }, [addToFavorites, removeFromFavorites]);

  const clearFavorites = useCallback(async () => {
    applyFavorites([]);
    await saveFavorites([]);
  }, [applyFavorites, saveFavorites]);

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

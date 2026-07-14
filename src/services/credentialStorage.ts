import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CREDENTIALS_KEY = 'user_credentials';
const REMEMBER_ME_KEY = '@haryad_remember_me';

interface StoredCredentials {
  email: string;
  password: string;
}

export class CredentialStorage {
  /**
   * Save credentials securely when remember me is enabled
   */
  static async saveCredentials(email: string, password: string): Promise<void> {
    try {
      const credentials: StoredCredentials = { email, password };
      await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials));
      await AsyncStorage.setItem(REMEMBER_ME_KEY, 'true');
    } catch (error) {
      throw new Error('Failed to save login credentials');
    }
  }

  /**
   * Get saved credentials if remember me was enabled
   */
  static async getCredentials(): Promise<StoredCredentials | null> {
    try {
      const rememberMe = await AsyncStorage.getItem(REMEMBER_ME_KEY);
      if (rememberMe !== 'true') {
        return null;
      }

      const credentialsString = await SecureStore.getItemAsync(CREDENTIALS_KEY);
      if (!credentialsString) {
        return null;
      }

      return JSON.parse(credentialsString) as StoredCredentials;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if remember me is enabled
   */
  static async isRememberMeEnabled(): Promise<boolean> {
    try {
      const rememberMe = await AsyncStorage.getItem(REMEMBER_ME_KEY);
      return rememberMe === 'true';
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear saved credentials (when user unchecks remember me or logs out)
   */
  static async clearCredentials(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
      await AsyncStorage.removeItem(REMEMBER_ME_KEY);
      // Also clear the old email storage for backward compatibility
      await AsyncStorage.removeItem('@haryad_remember_email');
    } catch (error) {
      // Silently fail - credentials clearing is not critical
    }
  }

  /**
   * Get only the saved email (for backward compatibility and initial form population)
   */
  static async getSavedEmail(): Promise<string | null> {
    try {
      const credentials = await this.getCredentials();
      return credentials?.email || null;
    } catch (error) {
      return null;
    }
  }
}

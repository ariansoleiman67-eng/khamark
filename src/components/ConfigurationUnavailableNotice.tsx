import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isSupabaseConfigured } from '../constants/config';

interface Props {
  onDismiss?: () => void;
}

/**
 * Controlled notice displayed when the new Khamark Supabase backend is not yet connected.
 * Prevents silent failures, avoids fallback to old credentials, and provides clear next steps.
 */
export const ConfigurationUnavailableNotice: React.FC<Props> = ({ onDismiss }) => {
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed || isSupabaseConfigured()) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
      <View style={styles.card}>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notice"
        >
          <Ionicons name="close" size={18} color="#666870" />
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-offline-outline" size={24} color="#A61920" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Khamark Backend Setup Required</Text>
            <Text style={styles.description}>
              This application has been successfully separated from the old backend and is ready to connect to your new Khamark Supabase project.
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.footerRow}>
          <Text style={styles.tipText}>
            Configure <Text style={styles.codeText}>EXPO_PUBLIC_SUPABASE_URL</Text> and{' '}
            <Text style={styles.codeText}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text> in your <Text style={styles.codeText}>.env</Text> file.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#FBEFF0',
    borderBottomWidth: 1,
    borderBottomColor: '#E7E7EA',
    zIndex: 1000,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#A61920',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#FBEFF0',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    padding: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FBEFF0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#A61920',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#666870',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#E7E7EA',
    marginVertical: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipText: {
    fontSize: 12,
    color: '#191919',
    lineHeight: 16,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
    color: '#831319',
  },
});

export default ConfigurationUnavailableNotice;

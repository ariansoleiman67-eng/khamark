import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  I18nManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import { SPACING } from '../../constants/theme';
import { sendNotificationToUsers } from '../../services/adminService';

// GOLDEN TEMPLATE: CTA height for bottom padding
const CTA_HEIGHT = 80;

type NotificationType = 'promotion' | 'general' | 'order';

/**
 * ADMIN SEND NOTIFICATION SCREEN - GOLDEN TEMPLATE
 * 
 * Architecture:
 * SafeAreaView (edges: ['top','left','right'])
 *  └── TENANT GATE (blocking loader if !tenantId)
 *      └── KeyboardAvoidingView
 *          ├── ScrollView (SINGLE vertical scroll owner)
 *          │    ├── Header (inside scroll)
 *          │    ├── Notification Type Selector
 *          │    ├── English Form
 *          │    ├── Arabic Form
 *          │    ├── Kurdish Form
 *          │    └── Preview
 *          └── Sticky CTA (Send Button - OUTSIDE scroll)
 * 
 * Rules enforced:
 * - ONE vertical scroll owner
 * - NO layout-affecting animations
 * - NO shadows
 * - NO writingDirection: rtl (textAlign only)
 * - tenantId required
 * - CTA outside scroll
 */
const AdminSendNotificationScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const insets = useSafeAreaInsets();
  const [sending, setSending] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    titleAr: '',
    titleKu: '',
    body: '',
    bodyAr: '',
    bodyKu: '',
    type: 'general' as NotificationType,
  });

  // GOLDEN TEMPLATE: Clear ALL state when tenantId changes
  useEffect(() => {
    setFormData({
      title: '',
      titleAr: '',
      titleKu: '',
      body: '',
      bodyAr: '',
      bodyKu: '',
      type: 'general',
    });
    setSending(false);
  }, [tenantId]);

  const notificationTypes: { key: NotificationType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { key: 'general', label: t('admin.sendNotification.general', { defaultValue: 'General' }), icon: 'megaphone', color: theme.colors.primary },
    { key: 'promotion', label: t('admin.sendNotification.promotion', { defaultValue: 'Promotion' }), icon: 'pricetag', color: '#FF9800' },
    { key: 'order', label: t('admin.sendNotification.order', { defaultValue: 'Order' }), icon: 'receipt', color: '#4CAF50' },
  ];

  const handleSend = async () => {
    if (!formData.title || !formData.body) {
      Alert.alert(t('admin.common.error'), t('admin.sendNotification.titleRequired'));
      return;
    }

    Alert.alert(
      t('admin.sendNotification.title'),
      t('admin.sendNotification.confirmSend'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.sendNotification.send'),
          onPress: async () => {
            setSending(true);
            try {
              await sendNotificationToUsers({
                title: formData.title,
                titleAr: formData.titleAr || formData.title,
                titleKu: formData.titleKu || formData.title,
                body: formData.body,
                bodyAr: formData.bodyAr || formData.body,
                bodyKu: formData.bodyKu || formData.body,
                type: formData.type,
                targetUsers: 'all',
              });
              
              Alert.alert(t('admin.common.success'), t('admin.sendNotification.success'), [
                { text: t('common.ok'), onPress: () => navigation.goBack() }
              ]);
              
              setFormData({
                title: '',
                titleAr: '',
                titleKu: '',
                body: '',
                bodyAr: '',
                bodyKu: '',
                type: 'general',
              });
            } catch (error) {
              Alert.alert(t('admin.common.error'), t('admin.sendNotification.failed'));
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  const getTypeTextColor = (typeKey: NotificationType) => {
    return formData.type === typeKey ? theme.colors.surface : theme.colors.text;
  };

  const isFormValid = formData.title.trim() && formData.body.trim();

  // GOLDEN TEMPLATE: TENANT GATE - Block UI until tenantId is resolved
  if (!tenantId || tenantLoading) {
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.tenantGate}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text allowFontScaling={false} style={[styles.tenantGateText, { color: theme.colors.text }]}>
            {t('admin.sendNotification.loading', { defaultValue: 'Loading...' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    // GOLDEN TEMPLATE: SafeAreaView with edges (NO bottom)
    <SafeAreaView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* GOLDEN TEMPLATE: ScrollView as SINGLE vertical scroll owner */}
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Header - Inside scroll per Golden Template */}
          <View style={[styles.header, { backgroundColor: theme.colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
              {t('admin.sendNotification.title')}
            </Text>
            <View style={styles.placeholder} />
          </View>

          {/* Notification Type */}
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.sendNotification.notificationType')}
          </Text>
          <View style={styles.typeContainer}>
            {notificationTypes.map((type) => (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.typeButton,
                  { 
                    backgroundColor: formData.type === type.key 
                      ? type.color 
                      : theme.colors.surface,
                  }
                ]}
                onPress={() => setFormData(prev => ({ ...prev, type: type.key }))}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={type.icon} 
                  size={20} 
                  color={formData.type === type.key ? theme.colors.surface : type.color} 
                />
                <Text allowFontScaling={false} style={[styles.typeText, { color: getTypeTextColor(type.key) }]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* English Content - GOLDEN TEMPLATE: NO shadows */}
          <View style={[styles.formCard, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.formCardHeader, { borderBottomColor: theme.colors.border }]}>
              <Ionicons name="language" size={20} color={theme.colors.primary} />
              <Text allowFontScaling={false} style={[styles.formCardTitle, { color: theme.colors.text }]}>
                {t('admin.sendNotification.english')}
              </Text>
            </View>
            
            <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
              {t('admin.sendNotification.titleLabel')} *
            </Text>
            <TextInput allowFontScaling={false}
              style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
              value={formData.title}
              onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
              placeholder={t('admin.sendNotification.titlePlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
            />

            <Text allowFontScaling={false} style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
              {t('admin.sendNotification.messageLabel')} *
            </Text>
            <TextInput allowFontScaling={false}
              style={[styles.input, styles.textArea, { backgroundColor: theme.colors.background, color: theme.colors.text }]}
              value={formData.body}
              onChangeText={(text) => setFormData(prev => ({ ...prev, body: text }))}
              placeholder={t('admin.sendNotification.messagePlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Arabic Content - GOLDEN TEMPLATE: textAlign only, NO writingDirection */}
          <View style={[styles.formCard, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.formCardHeader, { borderBottomColor: theme.colors.border }]}>
              <Text allowFontScaling={false} style={[styles.languageIcon, { color: theme.colors.primary }]}>ع</Text>
              <Text allowFontScaling={false} style={[styles.formCardTitle, { color: theme.colors.text }]}>
                {t('admin.sendNotification.arabic')}
              </Text>
            </View>
            
            <TextInput allowFontScaling={false}
              style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, textAlign: 'right' }]}
              value={formData.titleAr}
              onChangeText={(text) => setFormData(prev => ({ ...prev, titleAr: text }))}
              placeholder={t('admin.sendNotification.arabicTitlePlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
            />

            <TextInput allowFontScaling={false}
              style={[styles.input, styles.textArea, { backgroundColor: theme.colors.background, color: theme.colors.text, textAlign: 'right' }]}
              value={formData.bodyAr}
              onChangeText={(text) => setFormData(prev => ({ ...prev, bodyAr: text }))}
              placeholder={t('admin.sendNotification.arabicMessagePlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Kurdish Content - GOLDEN TEMPLATE: textAlign only, NO writingDirection */}
          <View style={[styles.formCard, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.formCardHeader, { borderBottomColor: theme.colors.border }]}>
              <Text allowFontScaling={false} style={[styles.languageIcon, { color: theme.colors.primary }]}>ک</Text>
              <Text allowFontScaling={false} style={[styles.formCardTitle, { color: theme.colors.text }]}>
                {t('admin.sendNotification.kurdish')}
              </Text>
            </View>
            
            <TextInput allowFontScaling={false}
              style={[styles.input, { backgroundColor: theme.colors.background, color: theme.colors.text, textAlign: 'right' }]}
              value={formData.titleKu}
              onChangeText={(text) => setFormData(prev => ({ ...prev, titleKu: text }))}
              placeholder={t('admin.sendNotification.kurdishTitlePlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
            />

            <TextInput allowFontScaling={false}
              style={[styles.input, styles.textArea, { backgroundColor: theme.colors.background, color: theme.colors.text, textAlign: 'right' }]}
              value={formData.bodyKu}
              onChangeText={(text) => setFormData(prev => ({ ...prev, bodyKu: text }))}
              placeholder={t('admin.sendNotification.kurdishMessagePlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Preview - GOLDEN TEMPLATE: NO shadows */}
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t('admin.sendNotification.preview')}
          </Text>
          <View style={[styles.previewCard, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.previewIcon, { backgroundColor: theme.colors.primary + '20' }]}>
              <Ionicons name="notifications" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.previewContent}>
              <Text allowFontScaling={false} style={[styles.previewTitle, { color: theme.colors.text }]}>
                {formData.title || t('admin.sendNotification.previewTitle')}
              </Text>
              <Text allowFontScaling={false} style={[styles.previewBody, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                {formData.body || t('admin.sendNotification.previewMessage')}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* GOLDEN TEMPLATE: Sticky CTA Bar OUTSIDE ScrollView */}
        <View style={[styles.stickyCtaBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, paddingBottom: insets.bottom || SPACING.md }]}>
          <TouchableOpacity
            style={[
              styles.sendButton, 
              { backgroundColor: theme.colors.primary },
              !isFormValid && styles.sendButtonDisabled
            ]}
            onPress={handleSend}
            disabled={sending || !isFormValid}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <>
                <Ionicons name="send" size={20} color={theme.colors.surface} />
                <Text allowFontScaling={false} style={[styles.sendButtonText, { color: theme.colors.surface }]}>
                  {t('admin.sendNotification.send')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // GOLDEN TEMPLATE: minHeight + aspectRatio for back button
  backButton: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 20,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 40,
  },
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  // GOLDEN TEMPLATE: NO shadows
  formCard: {
    borderRadius: 12,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  formCardHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  formCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  // GOLDEN TEMPLATE: NO shadows
  header: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    minHeight: 56,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  // GOLDEN TEMPLATE: minHeight for inputs
  input: {
    borderRadius: 10,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: SPACING.sm,
  },
  languageIcon: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    minWidth: 40,
  },
  previewBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  // GOLDEN TEMPLATE: NO shadows
  previewCard: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    padding: SPACING.md,
  },
  previewContent: {
    flex: 1,
  },
  // GOLDEN TEMPLATE: minHeight + aspectRatio for preview icon
  previewIcon: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 24,
    justifyContent: 'center',
    marginRight: SPACING.md,
    minHeight: 48,
    minWidth: 48,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  scrollView: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  // GOLDEN TEMPLATE: NO shadows
  sendButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: SPACING.md,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // GOLDEN TEMPLATE: Sticky CTA bar
  stickyCtaBar: {
    borderTopColor: 'rgba(0,0,0,0.1)',
    borderTopWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  tenantGate: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  tenantGateText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // GOLDEN TEMPLATE: NO shadows
  typeButton: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginHorizontal: 4,
    minHeight: 48,
    paddingVertical: SPACING.sm,
  },
  typeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default AdminSendNotificationScreen;

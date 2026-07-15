import React, { useState } from 'react';
import { openWhatsApp } from '../../utils/whatsapp';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { getDirection } from '../../locales';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { BRAND } from '../../constants/config';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: 'orders' | 'delivery' | 'payments' | 'products' | 'account' | 'general';
}



const HelpSupportScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;

  // FAQ Data
  const faqData: FAQItem[] = [
    {
      id: '1',
      category: 'orders',
      question: t('helpSupport.faq.questions.trackOrder.question'),
      answer: t('helpSupport.faq.questions.trackOrder.answer'),
    },
    {
      id: '2',
      category: 'orders',
      question: t('helpSupport.faq.questions.cancelOrder.question'),
      answer: t('helpSupport.faq.questions.cancelOrder.answer'),
    },
    {
      id: '3',
      category: 'delivery',
      question: t('helpSupport.faq.questions.deliveryAreas.question'),
      answer: t('helpSupport.faq.questions.deliveryAreas.answer'),
    },
    {
      id: '4',
      category: 'delivery',
      question: t('helpSupport.faq.questions.deliveryCost.question'),
      answer: t('helpSupport.faq.questions.deliveryCost.answer'),
    },
    {
      id: '5',
      category: 'payments',
      question: t('helpSupport.faq.questions.paymentMethods.question'),
      answer: t('helpSupport.faq.questions.paymentMethods.answer'),
    },
    {
      id: '6',
      category: 'products',
      question: t('helpSupport.faq.questions.genuineParts.question'),
      answer: t('helpSupport.faq.questions.genuineParts.answer'),
    },
    {
      id: '7',
      category: 'products',
      question: t('helpSupport.faq.questions.warranty.question'),
      answer: t('helpSupport.faq.questions.warranty.answer'),
    },
    {
      id: '8',
      category: 'account',
      question: t('helpSupport.faq.questions.resetPassword.question'),
      answer: t('helpSupport.faq.questions.resetPassword.answer'),
    },
    {
      id: '9',
      category: 'general',
      question: t('helpSupport.faq.questions.installation.question'),
      answer: t('helpSupport.faq.questions.installation.answer'),
    },
    {
      id: '10',
      category: 'general',
      question: t('helpSupport.faq.questions.returns.question'),
      answer: t('helpSupport.faq.questions.returns.answer'),
    },
  ];



  // Categories for filtering FAQs
  const categories = [
    { id: 'all', name: t('helpSupport.faq.categories.all'), icon: 'apps' },
    { id: 'orders', name: t('helpSupport.faq.categories.orders'), icon: 'receipt' },
    { id: 'delivery', name: t('helpSupport.faq.categories.delivery'), icon: 'car' },
    { id: 'payments', name: t('helpSupport.faq.categories.payments'), icon: 'card' },
    { id: 'products', name: t('helpSupport.faq.categories.products'), icon: 'cog' },
    { id: 'account', name: t('helpSupport.faq.categories.account'), icon: 'person' },
    { id: 'general', name: t('helpSupport.faq.categories.general'), icon: 'help-circle' },
  ];

  // Filter FAQs based on selected category
  const filteredFAQs = selectedCategory === 'all'
    ? faqData
    : faqData.filter(faq => faq.category === selectedCategory);

  // Handle FAQ toggle
  const toggleFAQ = (faqId: string) => {
    setExpandedFAQ(expandedFAQ === faqId ? null : faqId);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          padding: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Profile' as never)}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.text,
            marginLeft: isRTL ? 0 : SPACING.md,
            marginRight: isRTL ? SPACING.md : 0,
            textAlign: isRTL ? 'right' : 'left',
          }}>
            {t('helpSupport.title')}
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Welcome Section */}
          <View style={{
            backgroundColor: theme.colors.primary,
            padding: SPACING.xl,
            margin: SPACING.md,
            borderRadius: 16,
          }}>
            <Text allowFontScaling={false} style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: 'white',
              marginBottom: SPACING.sm,
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {t('helpSupport.welcome.title')}
            </Text>
            <Text allowFontScaling={false} style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.9)',
              lineHeight: 24,
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {t('helpSupport.welcome.description')}
            </Text>
          </View>

          {/* Contact Options */}
          <View style={{ padding: SPACING.md }}>


            {/* FAQ Section */}
            <Text allowFontScaling={false} style={{
              fontSize: 20,
              fontWeight: '600',
              color: theme.colors.text,
              marginBottom: SPACING.md,
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {t('helpSupport.faq.title')}
            </Text>

            {/* Category Filter */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: SPACING.lg }}
            >
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  onPress={() => setSelectedCategory(category.id)}
                  style={{
                    paddingHorizontal: SPACING.md,
                    paddingVertical: SPACING.sm,
                    borderRadius: 20,
                    marginRight: SPACING.sm,
                    backgroundColor: selectedCategory === category.id
                      ? theme.colors.primary
                      : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: selectedCategory === category.id
                      ? theme.colors.primary
                      : theme.colors.border,
                  }}
                >
                  <Text allowFontScaling={false} style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: selectedCategory === category.id
                      ? 'white'
                      : theme.colors.text,
                  }}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* FAQ List */}
            {filteredFAQs.map((faq) => (
              <View
                key={faq.id}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  marginBottom: SPACING.md,
                  overflow: 'hidden',
                  ...SHADOW_STYLES.small,
                }}
              >
                <TouchableOpacity
                  onPress={() => toggleFAQ(faq.id)}
                  style={{
                    padding: SPACING.md,
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text allowFontScaling={false} style={{
                    fontSize: 16,
                    fontWeight: '500',
                    color: theme.colors.text,
                    flex: 1,
                    marginLeft: isRTL ? SPACING.sm : 0,
                    marginRight: isRTL ? 0 : SPACING.sm,
                    textAlign: isRTL ? 'right' : 'left',
                  }}>
                    {faq.question}
                  </Text>
                  <Ionicons
                    name={expandedFAQ === faq.id ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>

                {expandedFAQ === faq.id && (
                  <View style={{
                    paddingHorizontal: SPACING.md,
                    paddingBottom: SPACING.md,
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.border + '50',
                  }}>
                    <Text allowFontScaling={false} style={{
                      fontSize: 14,
                      color: theme.colors.textSecondary,
                      lineHeight: 20,
                      marginTop: SPACING.sm,
                      textAlign: isRTL ? 'right' : 'left',
                    }}>
                      {faq.answer}
                    </Text>
                  </View>
                )}
              </View>
            ))}

            {/* Still Need Help Section */}
            <View style={{
              backgroundColor: theme.colors.primary + '10',
              padding: SPACING.lg,
              borderRadius: 12,
              marginTop: SPACING.lg,
              marginBottom: SPACING.xl,
              alignItems: 'center',
            }}>
              <Ionicons name="headset" size={48} color={theme.colors.primary} />
              <Text allowFontScaling={false} style={{
                fontSize: 18,
                fontWeight: '600',
                color: theme.colors.primary,
                marginTop: SPACING.md,
                marginBottom: SPACING.sm,
                textAlign: 'center',
              }}>
                {t('helpSupport.stillNeedHelp.title')}
              </Text>
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.primary,
                textAlign: 'center',
                lineHeight: 20,
                marginBottom: SPACING.lg,
              }}>
                {t('helpSupport.stillNeedHelp.description')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  openWhatsApp(BRAND.contactPhone, t('helpSupport.whatsappMessage', { defaultValue: "Hi, I need help with my question that's not covered in the FAQ" }));
                }}
                style={{
                  backgroundColor: theme.colors.primary,
                  paddingHorizontal: SPACING.lg,
                  paddingVertical: SPACING.md,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <MaterialCommunityIcons name="whatsapp" size={18} color="white" />
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: 'white',
                  marginLeft: SPACING.sm,
                }}>
                  {t('helpSupport.stillNeedHelp.chatButton')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default HelpSupportScreen;

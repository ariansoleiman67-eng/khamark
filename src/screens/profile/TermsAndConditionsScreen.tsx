import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { getDirection } from '../../locales';
import { SPACING } from '../../constants/theme';
import { BRAND, brandContact, contactBlockOr, CONTACT_FALLBACK } from '../../constants/config';

const TermsAndConditionsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;

  const termsContent = [
    {
      title: "1. ACCEPTANCE OF TERMS",
      content: `By accessing and using the ${BRAND.name} mobile application and services, you accept and agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.

These terms apply to all users, including customers, visitors, and others who access or use our service in the Kurdistan Region of Iraq and beyond.`
    },
    {
      title: "2. COMPANY INFORMATION",
      // "Business License: [License Number]" used to sit here — a literal bracketed
      // placeholder shown to every reader. Reinstate it only with a real number.
      content: `${BRAND.name}
${contactBlockOr(
  CONTACT_FALLBACK,
  ['Address', BRAND.address],
  ['Phone', BRAND.contactPhone],
  ['Email', BRAND.contactEmail],
)}

We are a registered online retailer offering a wide range of consumer electronics, accessories, and everyday products.`
    },
    {
      title: "3. PRODUCTS AND SERVICES",
      content: `3.1 PRODUCT AUTHENTICITY
• We guarantee all products are genuine and sourced from authorized suppliers
• All products come with applicable manufacturer warranties
• Counterfeit or replica products are explicitly prohibited
• Product specifications are accurate to the best of our knowledge

3.2 INVENTORY AND AVAILABILITY
• Product availability is subject to stock levels
• Prices and availability may change without notice
• We reserve the right to limit quantities per customer
• Discontinued items may be removed from the catalog`
    },
    {
      title: "4. ORDERING AND PAYMENT",
      content: `4.1 ORDER PROCESS
• Orders must be placed through our mobile application
• Order confirmation will be sent via SMS and email
• We reserve the right to refuse or cancel any order
• Bulk orders may require additional verification

4.2 PAYMENT METHODS
• Cash on Delivery (COD) - Available for all orders
• QI Card - Electronic payment system
• FIB Bank Cards - Visa/Mastercard accepted
• Bank Transfer - Direct bank transfer with receipt
• Mobile Wallets - As available in Kurdistan Region

4.3 PRICING
• All prices are in Iraqi Dinars (IQD)
• Prices include applicable taxes unless stated otherwise
• Shipping costs are calculated separately
• International customers may be subject to customs duties`
    },
    {
      title: "5. DELIVERY AND SHIPPING",
      content: `5.1 DELIVERY AREAS
We deliver throughout the Kurdistan Region of Iraq:
• Erbil Governorate and surrounding areas
• Sulaymaniyah Governorate and suburbs  
• Dohuk Governorate and nearby cities
• Remote areas subject to additional charges

5.2 DELIVERY TIMEFRAMES
• Standard Delivery: 1-3 business days within cities
• Express Delivery: Same day (where available)
• Remote Areas: 2-5 business days
• International Shipping: Upon request

5.3 SHIPPING COSTS
• Free shipping on orders over 500,000 IQD
• Standard shipping: 15,000 IQD
• Express shipping: 25,000 IQD
• Remote area surcharge: 10,000 IQD additional`
    },
    {
      title: "6. RETURNS AND EXCHANGES",
      content: `6.1 RETURN POLICY
• 7-day return period from delivery date
• Items must be unused and in original packaging
• Return shipping costs borne by customer (unless defective)
• Sealed items require original seals intact

6.2 EXCHANGE CONDITIONS
• Manufacturing defects: Full refund or exchange
• Wrong item ordered: Exchange for correct item
• Customer error: Exchange subject to 10% restocking fee
• Damage after delivery: Not eligible for return

6.3 REFUND PROCESS
• Refunds processed within 5-7 business days
• COD orders: Cash refund or bank transfer
• Card payments: Refund to original payment method
• Bank transfers: Direct account credit`
    },
    {
      title: "7. WARRANTIES",
      content: `7.1 PRODUCT WARRANTIES
• Products with manufacturer warranty: 12-24 months
• Electronics and appliances: Up to 24 months
• Accessories: 12 months
• Consumable items: 6 months

7.2 WARRANTY EXCLUSIONS
• Normal wear and tear
• Misuse or improper handling
• Damage from accidents or negligence
• Use inconsistent with product instructions
• Modifications or unauthorized repairs

7.3 WARRANTY CLAIMS
• Claims must be made within warranty period
• Original purchase receipt required
• Technical inspection may be required
• Replacement or repair at our discretion`
    },
    {
      title: "8. LIABILITY AND DISCLAIMERS",
      content: `8.1 LIMITATION OF LIABILITY
• Our liability is limited to the purchase price of products
• We are not liable for consequential or indirect damages
• Products should be used according to manufacturer instructions
• Customer assumes risk for improper use

8.2 PRODUCT SUITABILITY
• Customer responsible for verifying product suitability
• Product specifications are provided to help you choose
• We provide product guidance but not guarantees
• Incorrect orders due to wrong information: Customer responsibility

8.3 SETUP AND SUPPORT
• Setup guidance available for supported products
• Support provided for product-related questions
• Customer may seek independent assistance
• Warranty void if product is misused or tampered with`
    },
    {
      title: "9. INTELLECTUAL PROPERTY",
      content: `9.1 TRADEMARKS
• All product names and trademarks belong to their respective owners
• We are a retailer, not a manufacturer
• Brand names are used for identification purposes only
• Our branding and app design are our intellectual property

9.2 APP CONTENT
• Product descriptions and images are our property
• Unauthorized use of app content prohibited
• Technical specifications provided for reference only
• Customer reviews and feedback may be used for marketing`
    },
    {
      title: "10. DATA PROTECTION AND PRIVACY",
      content: `10.1 PERSONAL INFORMATION
• We collect information necessary for order processing
• Personal data handled according to our Privacy Policy
• Customer data never shared with unauthorized parties
• Account information encrypted and secured

10.2 COMMUNICATIONS
• We may send order updates via SMS and email
• Marketing communications require consent
• Opt-out available for promotional messages
• Support communications always permitted`
    },
    {
      title: "11. GOVERNING LAW",
      content: `11.1 JURISDICTION
• These terms governed by Iraqi law
• Kurdistan Regional Government regulations apply
• Disputes resolved through Iraqi court system
• Commercial law and consumer protection apply

11.2 DISPUTE RESOLUTION
• Good faith negotiation preferred for disputes
• Mediation available through commercial chambers
• Legal action as last resort
• Local language (Kurdish/Arabic) for official proceedings`
    },
    {
      title: "12. MODIFICATIONS AND UPDATES",
      content: `12.1 TERMS UPDATES
• We reserve right to update these terms
• Changes effective upon posting in app
• Continued use constitutes acceptance
• Significant changes will be notified to users

12.2 APP UPDATES
• App updates may include new features or terms
• Some updates may be mandatory for security
• Legacy versions may lose support
• Data backup recommended before major updates`
    },
    {
      title: "13. CONTACT INFORMATION",
      content: `For questions about these Terms and Conditions:

${BRAND.name}
${contactBlockOr(
  CONTACT_FALLBACK,
  ['Address', BRAND.address],
  ['Phone', BRAND.contactPhone],
  ['WhatsApp', BRAND.contactPhone],
  ['Email', BRAND.contactEmail],
)}

Business Hours:
Saturday - Thursday: 8:00 AM - 6:00 PM
Friday: 8:00 AM - 12:00 PM

Last Updated: January 2025`
    }
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

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
            <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.text,
            marginLeft: isRTL ? 0 : SPACING.md,
            marginRight: isRTL ? SPACING.md : 0,
            textAlign: isRTL ? 'right' : 'left',
          }}>
            {t('profile.termsAndConditions')}
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={{
            backgroundColor: theme.colors.primary,
            padding: SPACING.xl,
            margin: SPACING.md,
            borderRadius: 12,
          }}>
            <Text allowFontScaling={false} style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: 'white',
              marginBottom: SPACING.sm,
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {t('profile.termsAndConditions')}
            </Text>
            <Text allowFontScaling={false} style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.9)',
              lineHeight: 24,
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {t('profile.termsSubtitle')}
            </Text>
            <Text allowFontScaling={false} style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.8)',
              marginTop: SPACING.xs,
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {t('profile.termsEffectiveDate')}
            </Text>
          </View>

          {/* Terms Content */}
          <View style={{ padding: SPACING.md }}>
            {termsContent.map((section, index) => (
              <View key={index} style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: SPACING.lg,
                marginBottom: SPACING.md,
              }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: theme.colors.primary,
                  marginBottom: SPACING.md,
                  textAlign: isRTL ? 'right' : 'left',
                }}>
                  {section.title}
                </Text>

                <Text allowFontScaling={false} style={{
                  fontSize: 14,
                  color: theme.colors.text,
                  lineHeight: 22,
                  textAlign: isRTL ? 'right' : 'left',
                }}>
                  {section.content}
                </Text>
              </View>
            ))}

            {/* Footer */}
            <View style={{
              backgroundColor: theme.colors.primary + '10',
              padding: SPACING.lg,
              borderRadius: 12,
              marginBottom: SPACING.xl,
              alignItems: 'center',
            }}>
              <Ionicons name="shield-checkmark" size={48} color={theme.colors.primary} />
              <Text allowFontScaling={false} style={{
                fontSize: 18,
                fontWeight: '600',
                color: theme.colors.primary,
                marginTop: SPACING.md,
                marginBottom: SPACING.sm,
                textAlign: 'center',
              }}>
                {t('profile.termsFooterTitle', { defaultValue: 'Your Rights Protected' })}
              </Text>
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.primary,
                textAlign: 'center',
                lineHeight: 20,
                marginBottom: SPACING.md,
              }}>
                {t('profile.termsFooterBody', { defaultValue: 'These terms are designed to protect both customers and our business while ensuring fair, transparent transactions.' })}
              </Text>
              <Text allowFontScaling={false} style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                textAlign: 'center',
              }}>
                {brandContact(BRAND.contactEmail)
                  ? t('profile.termsFooterContact', { defaultValue: 'Questions? Contact us at {{email}}', email: brandContact(BRAND.contactEmail) })
                  : t('profile.termsFooterContactFallback', { defaultValue: 'Questions? Reach us through Help & Support in the app.' })}
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default TermsAndConditionsScreen;

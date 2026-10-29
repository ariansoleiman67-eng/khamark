import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING } from '../../constants/theme';
import { BRAND, brandContact, contactBlockOr, CONTACT_FALLBACK } from '../../constants/config';

const PrivacyPolicyScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const privacyContent = [
    {
      title: "1. INFORMATION WE COLLECT",
      content: `1.1 PERSONAL INFORMATION
When you use our ${BRAND.name} app, we collect:
• Full name and contact information
• Phone numbers and email addresses
• Delivery addresses and billing information
• Order and product preferences
• Payment information (securely processed)

1.2 AUTOMATICALLY COLLECTED DATA
• Device information (model, operating system, version)
• Location data (only if you grant permission, and only to set a delivery address)
• Network information and IP addresses
• A device token, if you enable push notifications, so we can send order updates

We do not use any analytics or advertising SDK, and we do not collect usage
analytics or crash reports.

1.3 OPTIONAL INFORMATION
• Profile photos and preferences
• Wishlist and saved items
• Product reviews and ratings
• Communication preferences
• Marketing consent preferences`
    },
    {
      title: "2. HOW WE USE YOUR INFORMATION",
      content: `2.1 PRIMARY BUSINESS PURPOSES
• Processing and fulfilling your orders
• Providing customer support and service
• Sending order confirmations and updates
• Managing returns, exchanges, and warranties
• Improving our products and services

2.2 COMMUNICATION
• Sending transactional messages (order status, shipping)
• Providing customer support responses
• Sending security alerts and important updates
• Marketing communications (only with consent)
• Surveys and feedback requests (optional)

2.3 BUSINESS OPERATIONS
• Fraud prevention and security monitoring
• Legal compliance and regulatory requirements
• Analytics to improve user experience
• Inventory management and supply chain
• Quality assurance and service improvement`
    },
    {
      title: "3. INFORMATION SHARING",
      content: `3.1 SERVICE PROVIDERS
We share information with trusted partners:
• Cloud hosting and database providers that store your account and orders
• Shipping and delivery staff, who receive the delivery address for your order
• Push notification delivery services

Orders in this release are paid cash on delivery or through a money exchanger, so
no card details are collected by the app or shared with a card processor.

3.2 BUSINESS TRANSFERS
• In case of merger, acquisition, or sale
• During business restructuring or reorganization
• With legal successors and assigns
• Always with equivalent privacy protection

3.3 LEGAL REQUIREMENTS
We may disclose information when required:
• To comply with Iraqi law and regulations
• In response to valid legal requests
• To protect our rights and property
• To ensure user safety and prevent fraud
• As required by Kurdistan Regional Government`
    },
    {
      title: "4. DATA SECURITY",
      content: `4.1 TECHNICAL SAFEGUARDS
• End-to-end encryption for sensitive data
• Secure HTTPS connections for all communications
• Regular security audits and vulnerability testing
• Multi-factor authentication for admin access
• Automated backup and disaster recovery

4.2 OPERATIONAL SECURITY
• Staff training on data protection practices
• Limited access on need-to-know basis
• Regular password updates and security protocols
• Incident response procedures
• Third-party security certifications

4.3 PAYMENT SECURITY
• PCI DSS compliance for card processing
• Tokenization of payment information
• No storage of complete card numbers
• Secure payment gateways only
• Regular security monitoring and fraud detection`
    },
    {
      title: "5. YOUR PRIVACY RIGHTS",
      content: `5.1 ACCESS AND CONTROL
You have the right to:
• Access your personal information
• Update and correct your data
• Delete your account and data
• Download your information (data portability)
• Opt-out of marketing communications

5.2 CONSENT MANAGEMENT
• Withdraw consent for data processing
• Update communication preferences
• Control location data sharing
• Manage cookie and tracking preferences
• Request information about data usage

5.3 DATA SUBJECT RIGHTS
Under applicable privacy laws:
• Right to be informed about data processing
• Right to rectification of inaccurate data
• Right to erasure ("right to be forgotten")
• Right to restrict processing
• Right to object to processing`
    },
    {
      title: "6. DATA RETENTION & ACCOUNT DELETION",
      content: `6.1 RETENTION & CLEANUP CONTRACT
• Account & Profile: Permanently deleted upon user account deletion request.
• Device & Push Tokens: Immediately purged upon account deletion.
• Private Media & Storage: Uploaded profile photos and attachments are automatically deleted.
• Chat & Messages: Deleted from active conversation records.
• Order Records: In accordance with commercial tax and accounting regulations, order transactions are unlinked from your identity, with customer name, phone number, and shipping addresses permanently redacted and anonymized.

6.2 DELETION PROCEDURES
• In-app self-service account deletion triggers the automated cleanup process immediately.
• User sessions, access tokens, and credentials are permanently revoked.`
    },
    {
      title: "7. INTERNATIONAL TRANSFERS",
      content: `7.1 DATA LOCATION
• Primary servers located in secure facilities
• Backup data may be stored internationally
• Cloud services may process data globally
• All transfers comply with applicable laws
• Adequate protection measures in place

7.2 TRANSFER SAFEGUARDS
• Standard contractual clauses
• Adequacy decisions where available
• Binding corporate rules for service providers
• Encryption during transit and storage
• Regular compliance audits

7.3 YOUR RIGHTS REGARDING TRANSFERS
• Right to be informed of transfer locations
• Right to object to certain transfers
• Right to request transfer restrictions
• Access to transfer safeguard documentation`
    },
    {
      title: "8. COOKIES AND TRACKING",
      content: `8.1 NO TRACKING AND NO ADVERTISING
• The app shows no advertising of any kind
• We do not track you across other companies' apps or websites
• We never access the device advertising identifier, and the app therefore never
  shows Apple's App Tracking Transparency prompt
• No Google Analytics, no advertising network, no social media tracking plugin

8.2 WHAT IS STORED ON YOUR DEVICE
• Your sign-in session, so you are not asked to log in every time
• Your language, currency and theme preferences
• A cached copy of the catalogue so the app opens quickly offline

Signing out or deleting the app removes all of it. There are no cookies — this is
a native app, not a website.`
    },
    {
      title: "9. CHILDREN'S PRIVACY",
      content: `9.1 AGE RESTRICTIONS
• The app is intended for general audiences shopping for consumer electronics
• It is not directed at children, and we do not knowingly collect data from a child
• The app does not ask for a date of birth and performs no age verification
• If you believe a child has given us personal information, contact us and we will
  delete it

9.2 PROTECTION MEASURES
• Enhanced privacy protections for minors
• Limited data collection from young users
• Parental control and oversight tools
• Clear consent mechanisms
• Regular compliance reviews

9.3 PARENTAL RIGHTS
• Access to child's information
• Request deletion of child's data
• Control communication preferences
• Monitor account activity
• Receive notifications of data use`
    },
    {
      title: "10. UPDATES TO THIS POLICY",
      content: `10.1 POLICY CHANGES
• Regular reviews and updates as needed
• Notification of material changes to users
• Updated effective dates clearly displayed
• Archive of previous policy versions
• Clear explanation of changes made

10.2 NOTIFICATION METHODS
• In-app notifications for major changes
• Email notifications to registered users
• SMS notifications for critical updates
• App store update descriptions
• Website and app banner notifications

10.3 CONTINUED USE
• Continued app use constitutes acceptance
• Option to review changes before acceptance
• Right to object to policy changes
• Account closure option if disagreeing with changes`
    },
    {
      title: "11. CONTACT INFORMATION",
      content: `For privacy-related questions or concerns:

PRIVACY OFFICER
${BRAND.name}
${contactBlockOr(
  CONTACT_FALLBACK,
  ['Address', BRAND.address],
  ['Phone', BRAND.contactPhone],
  ['Email', BRAND.contactEmail],
  ['WhatsApp', BRAND.contactPhone],
)}

DATA PROTECTION QUERIES
${contactBlockOr(
  CONTACT_FALLBACK,
  ['Email', BRAND.contactEmail],
  ['Phone', BRAND.contactPhone],
)}
Response Time: Within 72 hours
Business Hours: Saturday-Thursday 8AM-6PM, Friday 8AM-12PM

GENERAL SUPPORT
${contactBlockOr(
  CONTACT_FALLBACK,
  ['Email', BRAND.contactEmail],
  ['Phone', BRAND.contactPhone],
)}
Available: 6 days a week

Last Updated: January 2025
Policy Version: 2.1`
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
            {t('privacyPolicy.title', { defaultValue: 'Privacy Policy' })}
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Header Section */}
          <View style={{
            backgroundColor: theme.colors.success,
            padding: SPACING.xl,
            margin: SPACING.md,
            borderRadius: 12,
          }}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: SPACING.md }}>
              <Ionicons name="shield-checkmark" size={32} color="white" />
              <Text allowFontScaling={false} style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: 'white',
                marginLeft: isRTL ? 0 : SPACING.md,
                marginRight: isRTL ? SPACING.md : 0,
                textAlign: isRTL ? 'right' : 'left',
              }}>
                {t('privacyPolicy.title', { defaultValue: 'Privacy Policy' })}
              </Text>
            </View>
            <Text allowFontScaling={false} style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.9)',
              lineHeight: 24,
              marginBottom: SPACING.sm,
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {t('privacyPolicy.heroSubtitle')}
            </Text>
            <Text allowFontScaling={false} style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.8)',
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {t('privacyPolicy.effectiveDate')}
            </Text>
          </View>

          {/* Quick Summary */}
          <View style={{
            backgroundColor: theme.colors.primary + '10',
            margin: SPACING.md,
            padding: SPACING.lg,
            borderRadius: 12,
          }}>
            <Text allowFontScaling={false} style={{
              fontSize: 18,
              fontWeight: '600',
              color: theme.colors.primary,
              marginBottom: SPACING.md,
              textAlign: isRTL ? 'right' : 'left',
            }}>
              {t('privacyPolicy.quickSummary', { defaultValue: 'Privacy Quick Summary' })}
            </Text>

            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} style={{ marginTop: 2 }} />
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.text,
                marginLeft: isRTL ? 0 : SPACING.sm,
                marginRight: isRTL ? SPACING.sm : 0,
                flex: 1,
                textAlign: isRTL ? 'right' : 'left',
              }}>
                {t('privacyPolicy.summary.minimalData')}
              </Text>
            </View>

            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} style={{ marginTop: 2 }} />
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.text,
                marginLeft: isRTL ? 0 : SPACING.sm,
                marginRight: isRTL ? SPACING.sm : 0,
                flex: 1,
                textAlign: isRTL ? 'right' : 'left',
              }}>
                {t('privacyPolicy.summary.encrypted')}
              </Text>
            </View>

            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} style={{ marginTop: 2 }} />
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.text,
                marginLeft: isRTL ? 0 : SPACING.sm,
                marginRight: isRTL ? SPACING.sm : 0,
                flex: 1,
                textAlign: isRTL ? 'right' : 'left',
              }}>
                {t('privacyPolicy.summary.neverSell')}
              </Text>
            </View>

            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} style={{ marginTop: 2 }} />
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.text,
                marginLeft: isRTL ? 0 : SPACING.sm,
                marginRight: isRTL ? SPACING.sm : 0,
                flex: 1,
                textAlign: isRTL ? 'right' : 'left',
              }}>
                {t('privacyPolicy.summary.fullControl')}
              </Text>
            </View>
          </View>

          {/* Privacy Content */}
          <View style={{ padding: SPACING.md }}>
            {privacyContent.map((section, index) => (
              <View key={index} style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: SPACING.lg,
                marginBottom: SPACING.md,
                borderLeftWidth: 4,
                borderLeftColor: theme.colors.success,
              }}>
                <Text allowFontScaling={false} style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: theme.colors.success,
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

            {/* Contact Section */}
            <View style={{
              backgroundColor: theme.colors.success + '15',
              padding: SPACING.lg,
              borderRadius: 12,
              marginBottom: SPACING.xl,
              alignItems: 'center',
            }}>
              <Ionicons name="mail-outline" size={48} color={theme.colors.success} />
              <Text allowFontScaling={false} style={{
                fontSize: 18,
                fontWeight: '600',
                color: theme.colors.success,
                marginTop: SPACING.md,
                marginBottom: SPACING.sm,
                textAlign: 'center',
              }}>
                {t('privacyPolicy.contactHeading', { defaultValue: 'Questions About Your Privacy?' })}
              </Text>
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.success,
                textAlign: 'center',
                lineHeight: 20,
                marginBottom: SPACING.md,
              }}>
                Our privacy team is here to help. Contact us anytime with questions about how we handle your personal information.
              </Text>
              {/* Hidden entirely rather than shown empty: a pill is an address to
                  act on, so with no address configured there is nothing to render. */}
              {brandContact(BRAND.contactEmail) && (
                <View style={{
                  backgroundColor: theme.colors.success,
                  paddingHorizontal: SPACING.lg,
                  paddingVertical: SPACING.sm,
                  borderRadius: 25,
                }}>
                  <Text allowFontScaling={false} style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: 'white',
                  }}>
                    {brandContact(BRAND.contactEmail)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default PrivacyPolicyScreen;

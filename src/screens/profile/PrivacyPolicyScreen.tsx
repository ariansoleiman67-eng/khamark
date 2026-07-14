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
import { useTheme } from '../../components/ThemeProvider';
import { SPACING } from '../../constants/theme';

const PrivacyPolicyScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation();

  const privacyContent = [
    {
      title: "1. INFORMATION WE COLLECT",
      content: `1.1 PERSONAL INFORMATION
When you use our Haryad Auto Parts app, we collect:
• Full name and contact information
• Phone numbers and email addresses
• Delivery addresses and billing information
• Vehicle information (make, model, year, VIN)
• Payment information (securely processed)

1.2 AUTOMATICALLY COLLECTED DATA
• Device information (model, operating system, version)
• App usage analytics and performance metrics
• Location data (with your permission for delivery)
• Network information and IP addresses
• Crash reports and error logs

1.3 OPTIONAL INFORMATION
• Profile photos and preferences
• Vehicle maintenance history
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
• Payment processors (QI Card, FIB Bank, etc.)
• Shipping and delivery companies
• Cloud storage and hosting providers
• Analytics and performance monitoring services
• Customer support tools and platforms

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
      title: "6. DATA RETENTION",
      content: `6.1 RETENTION PERIODS
• Account information: While account is active
• Order history: 7 years for tax/legal compliance
• Payment data: As required by financial regulations
• Support communications: 3 years
• Marketing data: Until consent is withdrawn

6.2 DELETION PROCEDURES
• Automatic deletion after retention periods
• Secure deletion using industry standards
• Anonymization of data where legally required
• Regular purging of unnecessary data
• User-initiated deletion requests processed within 30 days

6.3 LEGAL HOLDS
Data may be retained longer if:
• Subject to legal proceedings
• Required for regulatory compliance
• Needed for fraud prevention
• Part of ongoing investigations`
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
      content: `8.1 TYPES OF COOKIES
• Essential cookies for app functionality
• Analytics cookies for usage insights
• Preference cookies for user settings
• Marketing cookies (with consent)
• Third-party cookies from integrated services

8.2 COOKIE MANAGEMENT
• Cookie preferences in app settings
• Browser settings for web-based access
• Opt-out options for non-essential cookies
• Regular cookie policy updates
• Clear information about cookie purposes

8.3 THIRD-PARTY TRACKING
• Google Analytics for app performance
• Social media plugins (if applicable)
• Payment processor tracking
• Advertising network cookies (with consent)
• Control options for all tracking`
    },
    {
      title: "9. CHILDREN'S PRIVACY",
      content: `9.1 AGE RESTRICTIONS
• App intended for users 18 years and older
• No knowingly collecting data from minors
• Parental consent required for users under 18
• Special protections for children's data
• Regular age verification procedures

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
Haryad Auto Parts Co.
Address: Iraq-Erbil-North Industry
Phone: +964 750 692 9085
Email: volvoha2025@gmail.com
WhatsApp: +964 750 692 9085

DATA PROTECTION QUERIES
Email: volvoha2025@gmail.com
Alternate Phone: +964 773 432 2255
Response Time: Within 72 hours
Business Hours: Saturday-Thursday 8AM-6PM, Friday 8AM-12PM

GENERAL SUPPORT
Email: volvoha2025@gmail.com
Phone: +964 750 692 9085
Alternate: +964 773 432 2255
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
          flexDirection: 'row',
          alignItems: 'center',
          padding: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Profile' as never)}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.text,
            marginLeft: SPACING.md,
          }}>
            Privacy Policy
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
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
              <Ionicons name="shield-checkmark" size={32} color="white" />
              <Text allowFontScaling={false} style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: 'white',
                marginLeft: SPACING.md,
              }}>
                Privacy Policy
              </Text>
            </View>
            <Text allowFontScaling={false} style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.9)',
              lineHeight: 24,
              marginBottom: SPACING.sm,
            }}>
              Your privacy is our priority. This policy explains how we collect, use, and protect your personal information.
            </Text>
            <Text allowFontScaling={false} style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.8)',
            }}>
              Effective Date: January 1, 2025 | Version 2.1
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
            }}>
              Privacy Quick Summary
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} style={{ marginTop: 2 }} />
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.text,
                marginLeft: SPACING.sm,
                flex: 1,
              }}>
                We only collect information necessary for providing our services
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} style={{ marginTop: 2 }} />
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.text,
                marginLeft: SPACING.sm,
                flex: 1,
              }}>
                Your data is encrypted and securely stored
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} style={{ marginTop: 2 }} />
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.text,
                marginLeft: SPACING.sm,
                flex: 1,
              }}>
                We never sell your personal information to third parties
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} style={{ marginTop: 2 }} />
              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.text,
                marginLeft: SPACING.sm,
                flex: 1,
              }}>
                You have full control over your data and can delete it anytime
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
                }}>
                  {section.title}
                </Text>

                <Text allowFontScaling={false} style={{
                  fontSize: 14,
                  color: theme.colors.text,
                  lineHeight: 22,
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
                Questions About Your Privacy?
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
                  volvoha2025@gmail.com
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default PrivacyPolicyScreen;

# AUDIT_COVERAGE.md

Total source files: 257 · Source LOC: 112203 · +config files.
Every file starts [ ]; only [x] after a full line-by-line read (state LOC + what was checked).

Every source + config file. `[ ]` = not yet line-by-line read. `[x]` = fully read (LOC stated + what was checked).


## functions/src

- [ ] functions/src/aiService.ts — 1813 LOC
- [ ] functions/src/index.ts — 2560 LOC
- [ ] functions/src/linkPhoneIndex.ts — 164 LOC

## src/components

- [ ] src/components/AdminAnimatedTabBar.tsx — 450 LOC
- [ ] src/components/AnimatedTabBar.tsx — 476 LOC
- [ ] src/components/AppNumber.tsx — 72 LOC
- [ ] src/components/AppText.tsx — 52 LOC
- [ ] src/components/AppTextInput.tsx — 191 LOC
- [ ] src/components/BannerCarousel.tsx — 333 LOC
- [ ] src/components/Button.tsx — 209 LOC
- [ ] src/components/CategoryGridCard.tsx — 77 LOC
- [ ] src/components/ColorPicker.tsx — 296 LOC
- [ ] src/components/CountdownDisplay.tsx — 193 LOC
- [ ] src/components/CurrencyPicker.tsx — 242 LOC
- [x] src/components/ErrorBoundary.tsx (Wave1 audited+fixed) — 186 LOC
- [ ] src/components/ForceUpdateModal.tsx — 461 LOC
- [ ] src/components/FormScreenWrapper.tsx — 44 LOC
- [ ] src/components/GoldenCarousel.tsx — 442 LOC
- [ ] src/components/Header.tsx — 107 LOC
- [ ] src/components/ImageViewerModal.tsx — 213 LOC
- [ ] src/components/Input.tsx — 268 LOC
- [ ] src/components/LanguagePicker.tsx — 261 LOC
- [ ] src/components/LiveOrderMap.tsx — 1057 LOC
- [ ] src/components/Logo.tsx — 121 LOC
- [x] src/components/MasonryProductCard.tsx (Wave1 audited+fixed) — 451 LOC
- [ ] src/components/OrderStatusBadge.tsx — 174 LOC
- [ ] src/components/PasswordPromptModal.tsx — 234 LOC
- [ ] src/components/PhoneAuthModal.tsx — 321 LOC
- [ ] src/components/PhoneInput.tsx — 632 LOC
- [x] src/components/ProductCard.tsx (Wave1 audited+fixed) — 703 LOC
- [ ] src/components/PushInitializer.tsx — 73 LOC
- [ ] src/components/ReauthModal.tsx — 463 LOC
- [ ] src/components/RelatedProductCard.tsx — 309 LOC
- [ ] src/components/SafeMapView.tsx — 199 LOC
- [ ] src/components/ScreenWrapper.tsx — 29 LOC
- [ ] src/components/ShareConversationPicker.tsx — 291 LOC
- [ ] src/components/SimpleMapPicker.tsx — 193 LOC
- [ ] src/components/SplashScreen.tsx — 282 LOC
- [ ] src/components/StartOrderBottomSheet.tsx — 1642 LOC
- [ ] src/components/StaticSkeleton.tsx — 242 LOC
- [ ] src/components/StoreHero.tsx — 411 LOC
- [ ] src/components/StoreHoursCountdown.tsx — 241 LOC
- [x] src/components/ThemeProvider.tsx (Wave1 audited+fixed) — 232 LOC
- [ ] src/components/VerificationCodeModal.tsx — 495 LOC
- [ ] src/components/VoiceBubble.tsx — 309 LOC
- [ ] src/components/chat/AttachmentMenu.tsx — 194 LOC
- [ ] src/components/home/BrandCard.tsx — 100 LOC
- [ ] src/components/home/BrandTile.tsx — 104 LOC
- [ ] src/components/home/SectionHeader.tsx — 52 LOC
- [ ] src/components/icons/CartIcon.tsx — 29 LOC
- [ ] src/components/voice/VoiceMessagePlaybackProvider.tsx — 42 LOC
- [ ] src/components/voice/useVoiceMessagePlayer.ts — 539 LOC

## src/constants

- [ ] src/constants/chatLabels.ts — 25 LOC
- [ ] src/constants/config.ts — 281 LOC
- [ ] src/constants/countries.ts — 1099 LOC
- [ ] src/constants/logoBase64.ts — 1 LOC
- [ ] src/constants/paperTheme.ts — 88 LOC
- [ ] src/constants/theme.ts — 227 LOC
- [ ] src/constants/themePresets.ts — 436 LOC

## src/contexts

- [x] src/contexts/AuthContext.tsx (Wave1 audited+fixed) — 289 LOC
- [x] src/contexts/CartContext.tsx (Wave1 audited+fixed) — 503 LOC
- [x] src/contexts/CurrencyContext.tsx (Wave1 audited+fixed) — 135 LOC
- [x] src/contexts/FavoritesContext.tsx (Wave1 audited+fixed) — 138 LOC
- [x] src/contexts/NotificationContext.tsx (Wave1 audited+fixed) — 185 LOC
- [x] src/contexts/TenantContext.tsx (Wave1 audited+fixed) — 273 LOC

## src/features

- [ ] src/features/image-editor/components/ColorPicker.tsx — 48 LOC
- [ ] src/features/image-editor/components/CropOverlay.tsx — 333 LOC
- [ ] src/features/image-editor/components/EditorCanvas.tsx — 205 LOC
- [ ] src/features/image-editor/components/EditorHeader.tsx — 72 LOC
- [ ] src/features/image-editor/components/EditorToolbar.tsx — 70 LOC
- [ ] src/features/image-editor/components/ImageEditorModal.tsx — 68 LOC
- [ ] src/features/image-editor/components/ImageEditorScreen.tsx — 197 LOC
- [ ] src/features/image-editor/components/OverlayWrapper.tsx — 141 LOC
- [ ] src/features/image-editor/components/TextInputModal.tsx — 143 LOC
- [ ] src/features/image-editor/components/TextOverlay.tsx — 28 LOC
- [ ] src/features/image-editor/hooks/useCanvasLayout.ts — 39 LOC
- [ ] src/features/image-editor/hooks/useEditorHistory.ts — 52 LOC
- [ ] src/features/image-editor/hooks/useImageEditor.ts — 81 LOC
- [ ] src/features/image-editor/index.ts — 3 LOC
- [ ] src/features/image-editor/services/coordinateMath.ts — 52 LOC
- [ ] src/features/image-editor/services/imageCrop.ts — 109 LOC
- [ ] src/features/image-editor/services/imageEditorBus.ts — 42 LOC
- [ ] src/features/image-editor/services/imageExport.ts — 17 LOC
- [ ] src/features/image-editor/services/imageLayout.ts — 50 LOC
- [ ] src/features/image-editor/state/editorInitialState.ts — 19 LOC
- [ ] src/features/image-editor/state/editorReducer.ts — 83 LOC
- [ ] src/features/image-editor/state/editorTypes.ts — 58 LOC
- [ ] src/features/image-editor/utils/clamp.ts — 8 LOC
- [ ] src/features/image-editor/utils/generateId.ts — 7 LOC

## src/hooks

- [ ] src/hooks/useAuthGate.ts — 77 LOC
- [ ] src/hooks/usePushMessageHandler.ts — 195 LOC
- [ ] src/hooks/usePushRegistration.ts — 197 LOC
- [ ] src/hooks/useStoreProfile.ts — 45 LOC
- [ ] src/hooks/useUserRegion.ts — 32 LOC

## src/locales

- [ ] src/locales/index.ts — 105 LOC

## src/navigation

- [ ] src/navigation/AdminTabNavigator.tsx — 141 LOC
- [x] src/navigation/AppNavigator.tsx (Wave1 audited+fixed) — 498 LOC
- [ ] src/navigation/MessengerStack.tsx — 21 LOC
- [ ] src/navigation/types.ts — 3 LOC

## src/screens

- [x] src/screens/BarcodeScannerScreen.tsx (Wave2 audited) — 431 LOC
- [x] src/screens/CartScreen.tsx (Wave1 audited+fixed) — 1171 LOC
- [x] src/screens/CategoriesScreen.tsx (Wave2 audited) — 1580 LOC
- [x] src/screens/CategoryProductsScreen.tsx (Wave2 audited) — 201 LOC
- [x] src/screens/ChatScreen.tsx (Wave2 audited) — 3125 LOC
- [x] src/screens/ChatbotScreen.tsx (Wave2 audited) — 925 LOC
- [x] src/screens/CheckoutScreen.tsx (Wave1 audited+fixed) — 2847 LOC
- [x] src/screens/FavoritesScreen.tsx (Wave2 audited) — 366 LOC
- [x] src/screens/NotificationsScreen.tsx (Wave2 audited) — 690 LOC
- [x] src/screens/OrderConfirmationScreen.tsx (Wave2 audited) — 441 LOC
- [x] src/screens/OrderDetailScreen.tsx (Wave2 audited) — 1553 LOC
- [x] src/screens/OrdersScreen.tsx (Wave2 audited) — 1388 LOC
- [x] src/screens/ProductDetailsScreen.tsx (Wave1 audited+fixed) — 3533 LOC
- [x] src/screens/ProfileScreen.tsx (Wave1 audited+fixed) — 768 LOC
- [x] src/screens/QiCardPaymentScreen.tsx (Wave2 audited) — 564 LOC
- [x] src/screens/SearchScreen.tsx (Wave2 audited) — 1062 LOC
- [x] src/screens/StoreLocationScreen.tsx (Wave2 audited) — 644 LOC
- [x] src/screens/StoreProductsScreen.tsx (Wave2 audited) — 157 LOC
- [x] src/screens/ThemeCustomizationScreen.tsx (Wave2 audited) — 638 LOC
- [ ] src/screens/admin/AdminAccountSecurityScreen.tsx — 401 LOC
- [ ] src/screens/admin/AdminAnalyticsScreen.tsx — 437 LOC
- [ ] src/screens/admin/AdminBannerScreen.tsx — 692 LOC
- [ ] src/screens/admin/AdminBrandManagerScreen.tsx — 221 LOC
- [ ] src/screens/admin/AdminBusinessInfoScreen.tsx — 411 LOC
- [ ] src/screens/admin/AdminCategoriesScreen.tsx — 220 LOC
- [ ] src/screens/admin/AdminCategoryManagerScreen.tsx — 216 LOC
- [ ] src/screens/admin/AdminChangePasswordScreen.tsx — 252 LOC
- [ ] src/screens/admin/AdminChatScreen.tsx — 9 LOC
- [ ] src/screens/admin/AdminConversationsListScreen.tsx — 675 LOC
- [ ] src/screens/admin/AdminCreateOrderScreen.tsx — 1356 LOC
- [ ] src/screens/admin/AdminCurrencySettingsScreen.tsx — 208 LOC
- [ ] src/screens/admin/AdminCustomersScreen.tsx — 1147 LOC
- [ ] src/screens/admin/AdminDashboardScreen.tsx — 1075 LOC
- [ ] src/screens/admin/AdminDetailsScreen.tsx — 246 LOC
- [ ] src/screens/admin/AdminDiscountsScreen.tsx — 517 LOC
- [ ] src/screens/admin/AdminEditDiscountScreen.tsx — 998 LOC
- [ ] src/screens/admin/AdminEditStoreLocationScreen.tsx — 786 LOC
- [ ] src/screens/admin/AdminInboxScreen.tsx — 722 LOC
- [ ] src/screens/admin/AdminInvoiceSettingsScreen.tsx — 546 LOC
- [ ] src/screens/admin/AdminOperatingHoursScreen.tsx — 331 LOC
- [ ] src/screens/admin/AdminOrdersScreen.tsx — 3596 LOC
- [ ] src/screens/admin/AdminPartnerAssignmentScreen.tsx — 336 LOC
- [ ] src/screens/admin/AdminPartnerDashboardScreen.tsx — 868 LOC
- [ ] src/screens/admin/AdminPartnerManagementScreen.tsx — 553 LOC
- [ ] src/screens/admin/AdminProductsScreen.tsx — 3173 LOC
- [ ] src/screens/admin/AdminPromoManagerScreen.tsx — 246 LOC
- [ ] src/screens/admin/AdminSecurityScreen.tsx — 325 LOC
- [ ] src/screens/admin/AdminSendNotificationScreen.tsx — 545 LOC
- [ ] src/screens/admin/AdminSettingsScreen.tsx — 900 LOC
- [ ] src/screens/admin/AdminSignupScreen.tsx — 394 LOC
- [ ] src/screens/admin/AdminStockReportScreen.tsx — 1608 LOC
- [ ] src/screens/admin/AdminStoreLocationsScreen.tsx — 360 LOC
- [ ] src/screens/admin/AdminStoreNameScreen.tsx — 268 LOC
- [ ] src/screens/admin/AdminStoreProfileScreen.tsx — 1564 LOC
- [ ] src/screens/admin/AdminSuccessScreen.tsx — 176 LOC
- [ ] src/screens/admin/AdminVerifyEmailScreen.tsx — 401 LOC
- [ ] src/screens/admin/ReportsGenerator.tsx — 1196 LOC
- [ ] src/screens/admin/index.ts — 7 LOC
- [ ] src/screens/admin/partnerInvoice.ts — 433 LOC
- [x] src/screens/auth/AboutYouScreen.tsx (Wave2 audited) — 481 LOC
- [x] src/screens/auth/ForgotPasswordScreen.tsx (Wave2 audited) — 673 LOC
- [x] src/screens/auth/LegacyEmailLoginScreen.tsx (Wave2 audited) — 265 LOC
- [x] src/screens/auth/LoginGateScreen.tsx (Wave2 audited) — 356 LOC
- [x] src/screens/auth/OnboardingScreen.tsx (Wave2 audited) — 154 LOC
- [x] src/screens/auth/PartnerSignupScreen.tsx (Wave2 audited) — 161 LOC
- [x] src/screens/auth/PasswordScreen.tsx (Wave2 audited) — 662 LOC
- [x] src/screens/auth/PhoneLoginScreen.tsx (Wave2 audited) — 798 LOC
- [x] src/screens/auth/RegisterScreen.tsx (Wave2 audited) — 752 LOC
- [x] src/screens/auth/RegisterSuccessScreen.tsx (Wave2 audited) — 184 LOC
- [x] src/screens/auth/SetNewPasswordScreen.tsx (Wave2 audited) — 594 LOC
- [x] src/screens/auth/SignInScreen.tsx (Wave2 audited) — 1287 LOC
- [x] src/screens/auth/VerifyPhoneScreen.tsx (Wave2 audited) — 721 LOC
- [x] src/screens/main/HomeScreen.tsx (Wave1 audited+fixed) — 792 LOC
- [x] src/screens/messenger/ChatThreadScreen.tsx (Wave2 audited) — 389 LOC
- [x] src/screens/messenger/ConversationsScreen.tsx (Wave2 audited) — 1418 LOC
- [x] src/screens/profile/AccountSecurityScreen.tsx (Wave2 audited) — 648 LOC
- [x] src/screens/profile/AddEditAddressScreen.tsx (Wave2 audited) — 1308 LOC
- [x] src/screens/profile/ChangePasswordScreen.tsx (Wave2 audited) — 894 LOC
- [x] src/screens/profile/ConfirmIdentityScreen.tsx (Wave2 audited) — 259 LOC
- [x] src/screens/profile/EditProfileScreen.tsx (Wave2 audited) — 464 LOC
- [x] src/screens/profile/HelpSupportScreen.tsx (Wave2 audited) — 355 LOC
- [x] src/screens/profile/MyAddressScreen.tsx (Wave2 audited) — 648 LOC
- [x] src/screens/profile/PaymentMethodsScreen.tsx (Wave2 audited) — 873 LOC
- [x] src/screens/profile/PrivacyPolicyScreen.tsx (Wave2 audited) — 509 LOC
- [x] src/screens/profile/ShippingInfoScreen.tsx (Wave2 audited) — 462 LOC
- [x] src/screens/profile/TermsAndConditionsScreen.tsx (Wave2 audited) — 372 LOC
- [x] src/screens/profile/UpdateEmailScreen.tsx (Wave2 audited) — 329 LOC
- [x] src/screens/profile/UpdatePhoneScreen.tsx (Wave2 audited) — 494 LOC
- [x] src/screens/store/StoreCompanyTab.tsx (Wave2 audited) — 634 LOC
- [x] src/screens/store/StoreHomeTab.tsx (Wave2 audited) — 459 LOC
- [x] src/screens/store/StoreProductsTab.tsx (Wave2 audited) — 479 LOC

## src/services

- [ ] src/services/NotificationService.ts — 580 LOC
- [ ] src/services/OrderService.ts — 719 LOC
- [ ] src/services/addressService.ts — 266 LOC
- [ ] src/services/adminService.ts — 582 LOC
- [ ] src/services/analyticsService.ts — 251 LOC
- [ ] src/services/appConfigService.ts — 336 LOC
- [ ] src/services/auth/appleAuth.ts — 31 LOC
- [ ] src/services/auth/facebookAuth.ts — 119 LOC
- [ ] src/services/auth/googleAuth.ts — 372 LOC
- [ ] src/services/auth/index.ts — 81 LOC
- [ ] src/services/auth/legacyEmailAuth.ts — 71 LOC
- [ ] src/services/auth/otpService.ts — 277 LOC
- [ ] src/services/auth/phonePasswordAuth.ts — 155 LOC
- [ ] src/services/auth/securityService.ts — 445 LOC
- [x] src/services/authService.ts (Wave1 audited+fixed) — 630 LOC
- [ ] src/services/bannerService.ts — 115 LOC
- [ ] src/services/brandService.ts — 104 LOC
- [x] src/services/cartService.ts (Wave1 audited+fixed) — 718 LOC
- [ ] src/services/categoryService.ts — 44 LOC
- [ ] src/services/categoryStore.ts — 95 LOC
- [ ] src/services/chatService.ts — 529 LOC
- [ ] src/services/chatbotService.ts — 1440 LOC
- [ ] src/services/credentialStorage.ts — 85 LOC
- [x] src/services/discountService.ts (Wave1 audited+fixed) — 433 LOC
- [ ] src/services/firebase.ts — 72 LOC
- [ ] src/services/imageService.ts — 267 LOC
- [ ] src/services/localCartService.ts — 461 LOC
- [ ] src/services/locationService.ts — 273 LOC
- [ ] src/services/mockData.ts — 194 LOC
- [ ] src/services/phoneAuthService.ts — 77 LOC
- [ ] src/services/phoneNumberService.ts — 200 LOC
- [x] src/services/productService.ts (Wave1 audited+fixed) — 500 LOC
- [x] src/services/promoService.ts (Wave1 audited+fixed) — 120 LOC
- [ ] src/services/qiCardPaymentService.ts — 176 LOC
- [ ] src/services/safeCallFunction.ts — 24 LOC
- [ ] src/services/settingsService.ts — 69 LOC
- [ ] src/services/storeProfileService.ts — 266 LOC
- [x] src/services/supabase.ts (Wave1 audited+fixed) — 69 LOC
- [ ] src/services/tenantAdminService.ts — 1542 LOC
- [ ] src/services/tenantInfoService.ts — 59 LOC
- [ ] src/services/videoService.ts — 257 LOC

## src/types

- [ ] src/types/index.ts — 850 LOC
- [ ] src/types/theme.ts — 96 LOC

## src/ui

- [ ] src/ui/FlyToCartLayer.tsx — 137 LOC
- [ ] src/ui/androidGlobalFix.ts — 74 LOC
- [ ] src/ui/cryptoPolyfill.ts — 44 LOC
- [ ] src/ui/patchPressable.ts — 41 LOC
- [ ] src/ui/patchText.ts — 70 LOC
- [ ] src/ui/patchTextInput.ts — 71 LOC
- [ ] src/ui/patchView.ts — 79 LOC
- [ ] src/ui/useAddToCartAnimation.ts — 62 LOC

## src/utils

- [ ] src/utils/cartUtils.ts — 76 LOC
- [ ] src/utils/categoryIcons.ts — 37 LOC
- [ ] src/utils/chatPreview.ts — 41 LOC
- [x] src/utils/currency.ts (Wave1 audited+fixed) — 414 LOC
- [ ] src/utils/dateUtils.ts — 187 LOC
- [ ] src/utils/deviceUtils.ts — 68 LOC
- [ ] src/utils/hashUtils.ts — 97 LOC
- [ ] src/utils/imageUtils.ts — 122 LOC
- [ ] src/utils/logger.ts — 65 LOC
- [ ] src/utils/phoneUtils.ts — 480 LOC
- [ ] src/utils/platform.ts — 116 LOC
- [ ] src/utils/pricingUtils.test.ts — 70 LOC
- [x] src/utils/pricingUtils.ts (Wave1 audited+fixed) — 112 LOC
- [ ] src/utils/safeFirebaseCall.ts — 55 LOC
- [ ] src/utils/timestampUtils.ts — 52 LOC
- [ ] src/utils/whatsapp.ts — 17 LOC

## Config / native

- [ ] app.json — 115 LOC
- [ ] package.json — 154 LOC
- [ ] babel.config.js — 11 LOC
- [ ] metro.config.js — 51 LOC
- [ ] tsconfig.json — 8 LOC
- [ ] eas.json — 85 LOC
- [ ] android/app/src/main/AndroidManifest.xml — 79 LOC
- [ ] android/app/build.gradle — 184 LOC
- [ ] android/build.gradle — 26 LOC
- [ ] android/gradle.properties — 69 LOC

# Khamark — Mobile Accessories & Consumer Electronics

A comprehensive React Native Expo application for online retail (consumer electronics & accessories) in Iraq, featuring multilingual support (English, Arabic, Kurdish) with RTL layout, secure payment processing, and real-time order tracking.

## 🚀 Features

### 🛒 **E-commerce Core**
- **Product Catalog**: Browse thousands of products across the store
- **Advanced Search**: Filter by category, price, SKU, and availability
- **Smart Cart**: Persistent cart with real-time price calculations
- **Secure Checkout**: Multiple payment options (COD, QI Card, FIB Card)
- **Order Tracking**: Real-time order status updates with delivery estimates

### 🌍 **Multilingual & Accessibility**
- **3 Languages**: English, Arabic (العربية), Kurdish (کوردی)
- **RTL Support**: Proper right-to-left layout for Arabic and Kurdish
- **Adaptive UI**: Dynamic text direction and layout adjustments
- **Cultural Localization**: Date formats, currency, and cultural preferences

### 🎨 **Brand Design**
- **Brand Consistency**: Cohesive brand palette and premium aesthetics
- **Dark/Light Modes**: Seamless theme switching with persistence
- **Smooth Animations**: Fluid transitions using Reanimated 3
- **Responsive Design**: Optimized for all screen sizes

### 🔐 **Security & Authentication**
- **Firebase Auth**: Secure email/password authentication
- **Protected Routes**: Role-based access control
- **Secure APIs**: Cloud Functions proxy for sensitive operations
- **Data Encryption**: End-to-end encryption for payment data

### 📱 **Modern Mobile Experience**
- **Push Notifications**: Real-time order updates and promotions
- **Offline Support**: Browse products without internet connection
- **Image Optimization**: Fast loading with intelligent caching
- **Performance**: Optimized rendering and memory management

## 🏗️ **Architecture**

### **Technology Stack**
- **Frontend**: React Native 0.81, Expo SDK 54
- **Backend**: Firebase (Auth, Firestore, Functions, Storage)
- **Navigation**: React Navigation v6 with TypeScript
- **State Management**: React Context + Hooks
- **Animations**: React Native Reanimated 3
- **Styling**: Custom theme system with TypeScript
- **Internationalization**: i18next with RTL support
- **Image Hosting**: ImgBB with secure Cloud Functions proxy

### **Project Structure**
```
src/
├── components/          # Reusable UI components
│   ├── Button.tsx      # Custom button with variants
│   ├── Input.tsx       # Form input with validation
│   ├── ProductCard.tsx # Product display card
│   └── ...
├── contexts/           # React Context providers
│   └── ThemeContext.tsx # Theme and dark mode
├── screens/            # Application screens
│   ├── auth/          # Authentication screens
│   ├── home/          # Home and catalog screens
│   ├── orders/        # Order management screens
│   └── profile/       # User profile screens
├── services/          # Business logic and API calls
│   ├── AuthService.ts # Authentication operations
│   ├── ProductService.ts # Product data management
│   ├── CartService.ts # Shopping cart operations
│   ├── OrderService.ts # Order processing
│   └── NotificationService.ts # Push notifications
├── utils/             # Helper functions
│   ├── currency.ts    # Currency formatting
│   ├── date.ts       # Date formatting
│   └── i18n.ts       # Internationalization
├── constants/         # App constants
│   ├── theme.ts      # Design system tokens
│   └── config.ts     # App configuration
├── types/            # TypeScript type definitions
│   └── index.ts      # All type exports
└── locales/          # Translation files
    ├── en.json       # English translations
    ├── ar.json       # Arabic translations
    └── ku.json       # Kurdish translations
```

## 🛠️ **Setup Instructions**

### **Prerequisites**
- Node.js 18+ and npm/yarn
- Expo CLI (`npm install -g @expo/cli`)
- Firebase project with enabled services
- ImgBB account for image hosting

### **Installation**
1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Asankary
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   # Copy environment template
   cp .env.example .env.local
   
   # Edit with your Firebase configuration
   nano .env.local
   ```

4. **Firebase setup**
   ```bash
   # Install Firebase CLI
   npm install -g firebase-tools
   
   # Login to Firebase
   firebase login
   
   # Deploy Cloud Functions
   cd functions
   npm install
   firebase functions:config:set imgbb.api_key="YOUR_IMGBB_API_KEY"
   firebase deploy --only functions
   ```

5. **Start development server**
   ```bash
   npm start
   # or
   expo start
   ```

### **Environment Variables**
Create `.env.local` file in the root directory:
```env
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id

# ImgBB Configuration (for development only)
EXPO_PUBLIC_IMGBB_API_KEY=your_imgbb_key
EXPO_PUBLIC_IMGBB_API_URL=https://api.imgbb.com/1/upload

# App Configuration
EXPO_PUBLIC_APP_NAME=Asankary
EXPO_PUBLIC_NODE_ENV=development
```

## 📦 **Key Components**

### **Services Layer**
- **AuthService**: User authentication and profile management
- **ProductService**: Product catalog with advanced filtering and search
- **CartService**: Shopping cart with real-time synchronization
- **OrderService**: Order management with real-time tracking
- **NotificationService**: Push notifications and in-app messaging
- **ImageService**: Secure image upload through Cloud Functions

### **UI Components**
- **ThemeProvider**: Centralized theme management with dark/light modes
- **Button**: Flexible button component with variants and loading states
- **Input**: Form input with validation and error handling
- **ProductCard**: Product display with animations and interactive elements

### **Screens**
- **Authentication**: Login, Register with validation and animations
- **Home**: Banner carousel, featured products, categories
- **Product Details**: Image gallery, specifications, add to cart
- **Cart & Checkout**: Cart management, address forms, payment selection
- **Orders**: Order history, tracking, reorder functionality
- **Profile**: User settings, notification preferences, language selection

## 🔧 **Development**

### **Available Scripts**
```bash
# Development
npm start              # Start Expo development server
npm run ios           # Run on iOS simulator
npm run android       # Run on Android emulator
npm run web           # Run on web browser

# Code Quality
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues
npm run type-check    # TypeScript type checking

# Building
npm run build:production   # Build store-ready for both platforms (EAS)
npm run build:android      # Android production build (AAB)
npm run build:ios          # iOS production build
npm run build:preview      # Internal testing builds

# OTA Updates (EAS Update)
npm run update:production  # Publish update to production branch
npm run update:preview     # Publish update to preview branch

# Store submission
npm run submit:android     # Submit Android build to Play Console
npm run submit:ios         # Submit iOS build to App Store Connect

# Firebase Functions
npm run deploy:functions   # Deploy Cloud Functions
```

### **Code Style**
- **TypeScript**: Strict mode enabled for type safety
- **ESLint**: Custom rules for React Native and Expo
- **Prettier**: Automated code formatting
- **Husky**: Pre-commit hooks for quality assurance

## 🚀 **Deployment**

### **Production Build**
1. **Update environment variables** for production
2. **Build the app** (EAS):
   ```bash
   npm run build:android   # Android AAB for Play Store
   npm run build:ios       # iOS Archive for App Store Connect
   ```
3. **Deploy Cloud Functions**:
   ```bash
   cd functions
   firebase use production-project-id
   firebase deploy --only functions
   ```

### **Security Checklist**
- ✅ API keys secured in Cloud Functions
- ✅ Firestore security rules implemented
- ✅ User authentication required for sensitive operations
- ✅ Input validation on client and server
- ✅ Image upload through secure proxy

## 🧪 **Testing**

### **Manual Testing Checklist**
- [ ] User registration and login flow
- [ ] Product browsing and search functionality
- [ ] Cart operations (add, remove, update quantities)
- [ ] Checkout process with all payment methods
- [ ] Order tracking and status updates
- [ ] Push notifications delivery
- [ ] Language switching and RTL layout
- [ ] Dark/light theme switching
- [ ] Offline functionality

### **Test Accounts**
```
Test User:
Email: test@ASANKARY_DOMAIN_TBD
Password: TestUser123!

Admin User:
Email: admin@ASANKARY_DOMAIN_TBD
Password: AdminUser123!
```

## 🌐 **Internationalization**

### **Supported Languages**
- **English (en)**: Default language, LTR layout
- **Arabic (ar)**: RTL layout, cultural date formats
- **Kurdish (ku)**: RTL layout, regional preferences

### **Adding New Languages**
1. Create translation file: `src/locales/{language}.json`
2. Update language detector in `src/utils/i18n.ts`
3. Add language option in Profile settings
4. Test RTL/LTR layout compatibility

## 📊 **Performance Optimizations**

### **Implemented Optimizations**
- **Image Caching**: Automatic image caching with size optimization
- **List Virtualization**: Efficient rendering for large product lists
- **Lazy Loading**: On-demand component and data loading
- **Memoization**: React.memo and useMemo for expensive calculations
- **Bundle Splitting**: Code splitting for faster initial load

### **Caching Strategy**
- **Products**: 15-minute cache with automatic refresh
- **Cart**: Real-time sync with offline fallback
- **Orders**: 5-minute cache with real-time updates
- **Notifications**: 10-minute cache with push notifications

## 💳 **Payment Integration**

### **Supported Methods**
- **Cash on Delivery (COD)**: No upfront payment required
- **QI Card**: Iraqi payment card integration (placeholder)
- **FIB Card**: First Iraqi Bank card integration (placeholder)

### **Security Features**
- Server-side payment validation
- Encrypted payment data transmission
- PCI DSS compliance considerations
- Fraud detection and prevention

## 📱 **Push Notifications**

### **Notification Types**
- **Order Updates**: Status changes, delivery notifications
- **Promotional**: Special offers, new product alerts
- **System**: App updates, maintenance notifications
- **Reminders**: Cart abandonment, reorder suggestions

### **Channels**
- **Orders**: High priority, immediate delivery
- **Promotions**: Standard priority, respectful frequency
- **System**: Critical updates only

## 🔒 **Security & Privacy**

### **Data Protection**
- End-to-end encryption for sensitive data
- GDPR compliance for EU users
- Local data minimization
- Secure authentication tokens

### **Privacy Features**
- Optional data collection with user consent
- Transparent privacy policy
- User data export and deletion
- Minimal permissions required

## 🐛 **Troubleshooting**

### **Common Issues**

**Build Errors**:
```bash
# Clear cache and reinstall
expo r -c
npm install

# Reset Metro bundler
npx expo start --clear
```

**Firebase Connection Issues**:
- Verify environment variables
- Check Firebase project configuration
- Ensure Firestore rules allow access

**Image Upload Problems**:
- Check ImgBB API key configuration
- Verify Cloud Functions deployment
- Test image size and format requirements

## 📈 **Analytics & Monitoring**

### **Metrics Tracked**
- User engagement and retention
- Product view and purchase rates
- Cart abandonment rates
- Order completion rates
- App performance metrics

### **Error Monitoring**
- Crash reporting with detailed stack traces
- Performance monitoring
- Network error tracking
- User feedback collection

## 🤝 **Contributing**

### **Development Workflow**
1. Create feature branch from `develop`
2. Implement changes with tests
3. Run quality checks (`npm run lint`, `npm run type-check`)
4. Submit pull request with detailed description

### **Code Standards**
- Follow TypeScript strict mode
- Use functional components with hooks
- Implement proper error handling
- Add JSDoc comments for complex functions
- Maintain consistent styling

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 **Support**

For technical support or business inquiries:
- **Email**: TODO_CONTACT_EMAIL
- **WhatsApp**: TODO_CONTACT_PHONE
- **Address**: TODO_CONTACT_ADDRESS

## 🎯 **Roadmap**

### **Version 1.1 (Planned)**
- [ ] Wishlist/Favorites functionality
- [ ] Product reviews and ratings
- [ ] Social sharing integration
- [ ] Advanced search filters
- [ ] Inventory alerts

### **Version 1.2 (Future)**
- [ ] AR product visualization
- [ ] Voice search functionality
- [ ] AI-powered recommendations
- [ ] Multi-vendor marketplace
- [ ] B2B wholesale features

### **Version 2.0 (Long-term)**
- [ ] Loyalty and rewards program
- [ ] Subscription and repeat-order scheduling
- [ ] Personalized product recommendations
- [ ] Store/pickup locator
- [ ] Smart-device integrations

## 🏆 **Acknowledgments**

- **Firebase Team**: For providing robust backend infrastructure
- **Expo Team**: For simplifying React Native development
- **React Native Community**: For excellent libraries and resources

---

**Built with ❤️ for shoppers across Iraq**

*"Bringing great products to customers across Iraq, one delivery at a time."*


npm run android local gradle for image fix image can fix intro call to junk file 

-color #F00021 chnage to black colmun so run it find intercall file can be imigrated so junk to be local intro test 

- color #F00132 trust callers so imagere call back to hash tag for imagreate in junk file 991233 0010: DA BC E3 5D                                        ...]


gole o
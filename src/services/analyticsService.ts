// @react-native-firebase/analytics is not installed — stub analytics as no-op
// If you want to add analytics, install @react-native-firebase/analytics
const getAnalytics = (): any => null;
const logEvent = (_analytics: any, _name: string, _params?: any) => {};
const setUserId = (_analytics: any, _id: string) => {};
const setUserProperties = (_analytics: any, _props: any) => {};

class AnalyticsService {
  private analytics = getAnalytics();

  // User Analytics
  setUser(userId: string, userProperties?: Record<string, any>) {
    try {
      setUserId(this.analytics, userId);
      
      if (userProperties) {
        setUserProperties(this.analytics, userProperties);
      }
      
      // Also set user for crashlytics
      // crashlytics().setUserId(userId); // Optional package
      
      if (userProperties) {
        // crashlytics().setAttributes(userProperties); // Optional package
      }
      
    } catch (error) {
      console.error('Analytics setUser error:', error);
    }
  }

  // Screen Tracking
  logScreenView(screenName: string, screenClass?: string) {
    try {
      // Analytics temporarily disabled
      /*
      logEvent(this.analytics, 'screen_view', {
        screen_name: screenName,
        screen_class: screenClass || screenName,
      });
      */
    } catch (error) {
      console.error('Analytics screen view error:', error);
    }
  }

  // E-commerce Events
  logPurchase(orderId: string, value: number, currency: string = 'IQD', items: any[]) {
    try {
      logEvent(this.analytics, 'purchase', {
        transaction_id: orderId,
        value: value,
        currency: currency,
        items: items.map(item => ({
          item_id: item.id,
          item_name: item.name,
          category: item.category,
          quantity: item.quantity,
          price: item.price,
        }))
      });
    } catch (error) {
      console.error('Analytics purchase error:', error);
    }
  }

  logAddToCart(itemId: string, itemName: string, category: string, value: number, currency: string = 'IQD') {
    try {
      logEvent(this.analytics, 'add_to_cart', {
        currency: currency,
        value: value,
        items: [{
          item_id: itemId,
          item_name: itemName,
          category: category,
          quantity: 1,
          price: value,
        }]
      });
    } catch (error) {
      console.error('Analytics add to cart error:', error);
    }
  }

  logRemoveFromCart(itemId: string, itemName: string, category: string, value: number, currency: string = 'IQD') {
    try {
      logEvent(this.analytics, 'remove_from_cart', {
        currency: currency,
        value: value,
        items: [{
          item_id: itemId,
          item_name: itemName,
          category: category,
          quantity: 1,
          price: value,
        }]
      });
    } catch (error) {
      console.error('Analytics remove from cart error:', error);
    }
  }

  logViewItem(itemId: string, itemName: string, category: string, value: number, currency: string = 'IQD') {
    try {
      logEvent(this.analytics, 'view_item', {
        currency: currency,
        value: value,
        items: [{
          item_id: itemId,
          item_name: itemName,
          category: category,
          price: value,
        }]
      });
    } catch (error) {
      console.error('Analytics view item error:', error);
    }
  }

  logSearch(searchTerm: string, category?: string) {
    try {
      logEvent(this.analytics, 'search', {
        search_term: searchTerm,
        category: category || 'all',
      });
    } catch (error) {
      console.error('Analytics search error:', error);
    }
  }

  // User Engagement
  logLogin(method: string = 'email') {
    try {
      logEvent(this.analytics, 'login', {
        method: method
      });
    } catch (error) {
      console.error('Analytics login error:', error);
    }
  }

  logSignUp(method: string = 'email') {
    try {
      logEvent(this.analytics, 'sign_up', {
        method: method
      });
    } catch (error) {
      console.error('Analytics sign up error:', error);
    }
  }

  // Custom Events
  logCustomEvent(eventName: string, parameters?: Record<string, any>) {
    try {
      logEvent(this.analytics, eventName, parameters);
    } catch (error) {
      console.error(`Analytics custom event (${eventName}) error:`, error);
    }
  }

  // Error and Crash Reporting
  recordError(error: Error, context?: Record<string, any>) {
    try {
      if (context) {
        // crashlytics().setAttributes(context); // Optional package
      }
      
      // crashlytics().recordError(error); // Optional package
    } catch (crashError) {
      console.error('Crashlytics record error failed:', crashError);
    }
  }

  logNonFatalError(message: string, details?: Record<string, any>) {
    try {
      if (details) {
        // crashlytics().setAttributes(details); // Optional package
      }
      
      // crashlytics().log(message); // Optional package
    } catch (error) {
      console.error('Crashlytics log error:', error);
    }
  }

  // App Performance
  logAppPerformance(metric: string, value: number, context?: Record<string, any>) {
    try {
      logEvent(this.analytics, 'app_performance', {
        metric_name: metric,
        metric_value: value,
        ...context
      });
    } catch (error) {
      console.error('Analytics performance error:', error);
    }
  }

  // Business Metrics
  logBusinessEvent(eventName: string, parameters: Record<string, any>) {
    try {
      logEvent(this.analytics, `business_${eventName}`, {
        timestamp: new Date().toISOString(),
        ...parameters
      });
    } catch (error) {
      console.error(`Analytics business event (${eventName}) error:`, error);
    }
  }

  // Session Management
  logSessionStart() {
    try {
      logEvent(this.analytics, 'session_start', {
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Analytics session start error:', error);
    }
  }

  logSessionEnd(duration: number) {
    try {
      logEvent(this.analytics, 'session_end', {
        session_duration: duration,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Analytics session end error:', error);
    }
  }

  // Enable/Disable Analytics (for GDPR compliance)
  setAnalyticsEnabled(enabled: boolean) {
    try {
      // Note: This would require Firebase Analytics SDK configuration
      // analytics().setAnalyticsCollectionEnabled(enabled);
      
      if (!enabled) {
        // crashlytics().setCrashlyticsCollectionEnabled(false); // Optional package
      } else {
        // crashlytics().setCrashlyticsCollectionEnabled(true); // Optional package
      }
    } catch (error) {
      console.error('Analytics enable/disable error:', error);
    }
  }
}

export default new AnalyticsService();

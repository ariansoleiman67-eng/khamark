import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallbackComponent?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to your error reporting service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // You can also log the error to an error reporting service
    // crashlytics().recordError(error);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReportError = () => {
    if (!__DEV__) {
      // Never surface raw error message/stack to end users in production.
      Alert.alert('Something went wrong', 'Please try again. If the problem persists, contact support.');
      return;
    }
    const errorMessage = this.state.error?.message || 'Unknown error';
    const errorStack = this.state.error?.stack || 'No stack trace available';

    Alert.alert(
      'Error Details',
      `Error: ${errorMessage}\n\nStack: ${errorStack}`,
      [
        { text: 'OK', style: 'default' },
        { text: 'Copy Error', onPress: () => console.log('Error copied to clipboard') }
      ]
    );
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallbackComponent) {
        return this.props.fallbackComponent;
      }

      return (
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons name="alert-circle-outline" size={80} color="#FF6B6B" />
          </View>
          
          <Text allowFontScaling={false} style={styles.title}>Oops! Something went wrong</Text>
          <Text allowFontScaling={false} style={styles.subtitle}>
            We encountered an unexpected error. This has been logged and we'll look into it.
          </Text>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.primaryButton} onPress={this.handleReset}>
              <Text allowFontScaling={false} style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.secondaryButton} onPress={this.handleReportError}>
              <Text allowFontScaling={false} style={styles.secondaryButtonText}>View Error Details</Text>
            </TouchableOpacity>
          </View>
          
          {__DEV__ && this.state.error && (
            <View style={styles.debugInfo}>
              <Text allowFontScaling={false} style={styles.debugTitle}>Debug Info (DEV):</Text>
              <Text allowFontScaling={false} style={styles.debugText} numberOfLines={20} selectable>
                {this.state.error.toString()}
                {'\n\n'}
                {this.state.errorInfo?.componentStack}
              </Text>
            </View>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  buttonContainer: {
    gap: 12,
    width: '100%',
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  debugInfo: {
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
    marginTop: 32,
    maxHeight: 200,
    padding: 16,
    width: '100%',
  },
  debugText: {
    color: '#4A5568',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  debugTitle: {
    color: '#2D3748',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  iconContainer: {
    marginBottom: 24,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#3182ce',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  secondaryButtonText: {
    color: '#3182ce',
    fontSize: 16,
    fontWeight: '500',
  },
  subtitle: {
    color: '#666666',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    textAlign: 'center',
  },
  title: {
    color: '#333333',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
});

export default ErrorBoundary;

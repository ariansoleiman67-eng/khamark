# Haryad Auto Part - Firebase Cloud Functions

This directory contains Firebase Cloud Functions for the Haryad Auto Part mobile application.

## Setup Instructions

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Initialize Firebase Project
```bash
firebase init
```

### 4. Install Dependencies
```bash
cd functions
npm install
```

### 5. Set Environment Variables
For local development, keep backend secrets in `functions/.env` only.

1. Copy the example file:
```bash
cp functions/.env.example functions/.env
```

2. Add your real backend secrets to `functions/.env`:
```bash
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4.1-mini
IMGBB_API_KEY=YOUR_IMGBB_API_KEY
```

Do not place backend-only secrets in Expo `EXPO_PUBLIC_*` variables.

### 6. Deploy Functions
```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:uploadImage
```

### 7. Local Development
```bash
# Start local emulator
npm run serve

# Or run Firebase emulator suite
firebase emulators:start
```

The functions runtime loads `functions/.env` directly, so the mobile app env and backend env stay separate during local development.

### Local Sora CLI with Backend Env
If you want to run the local Sora helper while keeping the key in `functions/.env`, use:
```bash
zsh scripts/run_sora_with_functions_env.sh create --prompt-file tmp/sora/haryad-app-teaser-v1.txt --no-augment --model sora-2 --size 720x1280 --seconds 8
```

## Available Functions

### Image Upload Functions

#### `uploadImage`
- **Type**: HTTP Callable Function
- **Purpose**: Securely upload images to ImgBB without exposing API key
- **Authentication**: Required
- **Parameters**:
  - `image`: Base64 encoded image data
  - `fileName`: Optional filename for the image
- **Returns**: Image URL and metadata

### Payment Functions

#### `processPayment`
- **Type**: HTTP Callable Function
- **Purpose**: Process payments for orders (COD, QI Card, FIB Card)
- **Authentication**: Required
- **Parameters**:
  - `orderId`: Order ID to process payment for
  - `paymentMethod`: Payment method ('cod', 'qi', 'fib')
  - `paymentData`: Payment-specific data
- **Returns**: Payment result with transaction ID

#### `createOrder`
- **Type**: HTTP Callable Function
- **Purpose**: Create and validate orders server-side
- **Authentication**: Required
- **Parameters**:
  - `cartItems`: Array of cart items
  - `shippingAddress`: Shipping address object
  - `paymentMethod`: Payment method
  - `notes`: Optional order notes
- **Returns**: Order ID and details

### Admin Functions

#### `updateOrderStatus`
- **Type**: HTTP Callable Function
- **Purpose**: Update order status and send notifications
- **Authentication**: Required (Admin role preferred)
- **Parameters**:
  - `orderId`: Order ID to update
  - `status`: New status
  - `trackingNumber`: Optional tracking number
- **Returns**: Success confirmation

#### `sendPromotionalNotification`
- **Type**: HTTP Callable Function
- **Purpose**: Send promotional notifications to users
- **Authentication**: Required (Admin role)
- **Parameters**:
  - `title`, `titleAr`, `titleKu`: Notification titles
  - `body`, `bodyAr`, `bodyKu`: Notification bodies
  - `targetUsers`: Optional array of user IDs
- **Returns**: Success confirmation with sent count

### Utility Functions

#### `healthCheck`
- **Type**: HTTP Request Function
- **Purpose**: Health check endpoint for monitoring
- **Authentication**: Not required
- **Returns**: Health status and timestamp

## Environment Configuration

### Required Config Variables
```bash
# ImgBB API Key for secure image uploads
firebase functions:config:set imgbb.api_key="YOUR_IMGBB_API_KEY"

# Add other config variables as needed
firebase functions:config:set app.name="Haryad Auto Part"
firebase functions:config:set app.version="1.0.0"
```

For deployed OpenAI usage, keep `OPENAI_API_KEY` in your server-side deployment environment or secret manager. Do not expose it to the client app.

### View Current Config
```bash
firebase functions:config:get
```

## Security Considerations

1. **API Key Security**: The ImgBB API key is stored as a Firebase Functions config variable and never exposed to the client.

2. **Authentication**: All functions that modify data require user authentication.

3. **Authorization**: Admin functions check for admin role in user tokens.

4. **Input Validation**: All functions validate input parameters and sanitize data.

5. **Rate Limiting**: Consider implementing rate limiting for upload functions.

## Monitoring and Logging

- View function logs: `firebase functions:log`
- Monitor function performance in Firebase Console
- Set up alerts for function errors and performance issues

## Development Tips

1. **Local Testing**: Use Firebase Emulators for local development
2. **TypeScript**: Functions are written in TypeScript for better type safety
3. **Error Handling**: All functions include comprehensive error handling
4. **Logging**: Use `console.log()` and `console.error()` for debugging

## Deployment

### Staging Deployment
```bash
firebase use staging-project-id
firebase deploy --only functions
```

### Production Deployment
```bash
firebase use production-project-id
firebase deploy --only functions
```

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure proper Firebase project permissions
2. **Config Variables**: Make sure all required config variables are set
3. **Dependencies**: Run `npm install` in functions directory
4. **TypeScript Errors**: Check `tsconfig.json` and fix type issues

### Useful Commands
```bash
# Check function status
firebase functions:list

# Delete a function
firebase functions:delete functionName

# View function configuration
firebase functions:config:get
```

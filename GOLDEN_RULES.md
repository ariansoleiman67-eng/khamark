# GOLDEN RULES - HARYAD AUTO PART

**FINAL · FREEZE FOREVER · NON-NEGOTIABLE**

This document defines how your app is built.
Any future code must comply, or it is rejected.

---

## 🔒 GOLDEN PRINCIPLE

> **Stability > Beauty > Speed > Features**

If a feature risks scroll, keyboard, or tenant bugs — it is forbidden.

---

## 1️⃣ LAYOUT & SCROLL RULES (CRITICAL)

### ✅ ALLOWED

- ONE vertical scroll owner per screen
- `ScrollView` OR `FlatList` OR `FlashList`
- Horizontal scrolls ONLY inside vertical lists
- `ListHeaderComponent` for headers

### ❌ FORBIDDEN

- `ScrollView` inside `ScrollView` (vertical)
- `Animated.ScrollView`
- `scrollEnabled={false}` on vertical lists
- Header outside scroll owner

---

## 2️⃣ RTL & TEXT RULES (ANDROID SAFE)

### ✅ ALLOWED

- `textAlign: 'right' | 'left'`
- `I18nManager.isRTL`

### ❌ FORBIDDEN

- `writingDirection: 'rtl'` ❌❌❌
- Forced RTL layouts

### EXCEPTION

- Numbers → always `ltr` (`AppNumber` only)

---

## 3️⃣ KEYBOARD RULES (MANDATORY)

### Required Structure

```
SafeAreaView (top, left, right)
 └── KeyboardAvoidingView
     └── ScrollView / FlatList
```

### Required Props

```tsx
keyboardShouldPersistTaps = "handled";
keyboardDismissMode = "interactive";
```

### ❌ FORBIDDEN

- `KeyboardAvoidingView` INSIDE `ScrollView`
- Fixed input heights
- Inputs inside Touchable wrappers

---

## 4️⃣ STYLING RULES

### Heights

- ❌ `height: 48`
- ❌ `height: 100`
- ✅ `minHeight` only
- ✅ `aspectRatio` for images

### Shadows

- ❌ NO shadows in scrollable lists
- ✅ Shadows allowed on:
  - Headers
  - Fixed CTAs
  - Modals

---

## 5️⃣ ANIMATION POLICY

### ❌ ABSOLUTELY FORBIDDEN

- Reanimated
- Layout animations
- Entering / exiting animations
- Parallax headers

### ✅ ALLOWED

- Opacity via `TouchableOpacity`
- Natural scroll momentum

---

## 6️⃣ DATA & LOGIC RULES

### Variants

- ❌ NO variant systems
- ❌ NO SKU trees
- ❌ NO price-per-option

### Options (Color / Size)

- ✅ Cosmetic only
- ✅ Optional
- ✅ Display-only in admin
- ❌ No stock / price effect

---

## 7️⃣ TENANT ISOLATION (ADMIN)

### Mandatory

```tsx
if (!tenantId) return <BlockingLoader />;
```

- Clear ALL state on tenant change
- `tenantId` included in:
  - queries
  - keys
  - cache

---

## 8️⃣ UI CONSISTENCY

### Cards
- so it must at least 12 
- cold brave so it can be a lot of pressure 
- if meant the black color is must be a fantastic 
- video is most of the apple to join them in the part of the call cell   
-for the color it must be white to the champion for the insert or  down the system 
- in some 
- Radius: `12`
- Padding: `SPACING.md`
- No custom deviations

### Typography

| Role          | Size  | Weight |
| ------------- | ----- | ------ |
| Section title | 16    | 600    |
| Body          | 14–15 | 500    |
| Meta          | 12    | 400    |

---

## 🔒 GOLDEN LOCK

Once this document is accepted:

> **No rule may be broken without full refactor approval**

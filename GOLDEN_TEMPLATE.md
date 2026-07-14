# APP-WIDE GOLDEN FREEZE & ENGINEERING RULES

**Permanent – Non-Negotiable**

- **Applies to:** Entire application
- **Effective from:** January 2026
- **Scope:** All existing and future screens, features, hotfixes, and refactors

---

## 🎯 PURPOSE

This document permanently freezes the layout, scroll, keyboard, auth, and structural rules of the app.

Its goal is to ensure the app remains:

- ✅ **OEM-safe** (Samsung, Xiaomi, Oppo, Pixel)
- ✅ **Font-scale safe** (100%–150%)
- ✅ **Keyboard-safe**
- ✅ **Regression-proof**

**Any change that violates this document is invalid by default.**

---

## 1️⃣ GLOBAL GOLDEN RULES (APPLY TO EVERY SCREEN)

These rules are **absolute**.

### Scroll & Layout

- ✅ Exactly **ONE vertical scroll owner** per screen
- ❌ NEVER nest `ScrollView` and vertical `FlatList` / `FlashList`
- ❌ NEVER use multiple vertical scroll containers
- ❌ NEVER wrap a vertical list inside a `ScrollView`

### Heights & Sizing

- ❌ NEVER use `height: X` for:
  - cards
  - inputs
  - text
  - rows
  - containers
- ✅ Use `padding` + `minHeight`
- ✅ Let content define height

### Images

- ❌ NEVER use fixed image height
- ✅ Images MUST use `aspectRatio`
  - Product images: `1`
  - Banners: `16 / 9`
  - Avatars/icons: `1`

### Keyboard

- ✅ Keyboard MUST push layout, never overlay it
- ✅ ALL inputs MUST be inside the scroll owner
- ❌ NO floating inputs or absolute positioning

### Safe Areas

- ✅ `SafeAreaView` handles **top / left / right ONLY**
- ❌ NEVER use `SafeAreaView` bottom edge
- ✅ Bottom spacing handled via:
  ```
  paddingBottom = CTA / TabBar height + insets.bottom
  ```

### Animations

- ❌ Layout-affecting animations are **FORBIDDEN**:
  - Reanimated entering/exiting
  - Parallax
  - Scale/translate headers
- ❌ No scroll-linked animations
- ✅ Opacity-only animations allowed (non-layout)

---

## 2️⃣ APPROVED SCREEN SKELETONS (CANONICAL)

Every screen MUST use one of these skeletons.

### 🟢 FEED / LIST SCREENS

_(Home, Product List, Orders)_

```
SafeAreaView (top/left/right)
 → KeyboardAvoidingView
   → FlatList (SINGLE vertical scroll owner)
```

**Rules:**

- Header MUST be inside `ListHeaderComponent`
- Horizontal lists allowed inside header only

### 🟢 FORM SCREENS

_(Login, Checkout, Address)_

```
SafeAreaView (top/left/right)
 → KeyboardAvoidingView
   → ScrollView (SINGLE vertical scroll owner)
   → Sticky CTA outside ScrollView
```

**Rules:**

- ALL inputs inside `ScrollView`
- CTA outside scroll
- `ScrollView` padded for CTA

### 🟢 DETAIL SCREENS

_(Product Details)_

```
SafeAreaView (top/left/right)
 → KeyboardAvoidingView
   → ScrollView (SINGLE vertical scroll owner)
   → Sticky CTA outside ScrollView
```

**Rules:**

- Related products = horizontal list only
- No vertical lists inside `ScrollView`

### 🟢 MENU / ACCOUNT SCREENS

_(Profile)_

```
SafeAreaView (top/left/right)
 → ScrollView (SINGLE vertical scroll owner)
```

**Rules:**

- Sections stack naturally
- No fixed row heights

---

## 3️⃣ BANNED PATTERNS (FOREVER)

The following are **explicitly forbidden**:

| Pattern                                      | Status    |
| -------------------------------------------- | --------- |
| `height: X` on any dynamic content           | ❌ BANNED |
| `justifyContent: 'center'` on scroll content | ❌ BANNED |
| Absolute positioning for core UI             | ❌ BANNED |
| Hardcoded bottom padding                     | ❌ BANNED |
| Screen-width math for layout sizing          | ❌ BANNED |
| Shadows on cards, lists, CTAs                | ❌ BANNED |
| Auth checks inside UI render trees           | ❌ BANNED |
| Showing protected content to guests          | ❌ BANNED |
| "Quick fixes" that bypass Golden rules       | ❌ BANNED |

**If any of these appear → change is rejected.**

---

## 4️⃣ AUTH & GUEST RULES (APP-WIDE)

### Guest users CAN:

- ✅ Browse products
- ✅ View product details
- ✅ Add items to cart

### Guest users CANNOT:

- ❌ Checkout
- ❌ View Orders
- ❌ View Account data

### LoginGate rules:

- Login is triggered ONLY by intent:
  - Checkout
  - Orders
  - Account actions
- ❌ Never block browsing
- ❌ Never partially render protected screens

**Orders, Checkout, Profile (auth sections) are auth-only.**

---

## 5️⃣ PERFORMANCE & STABILITY BASELINE

### Required defaults:

- ✅ Stable `keyExtractor`
- ✅ `removeClippedSubviews={true}` where applicable
- ✅ No unnecessary re-renders
- ✅ No runtime layout calculations
- ✅ No scroll-linked JS logic

**Stability > visual effects.**

---

## 6️⃣ CHANGE CONTROL (CRITICAL)

This is what enforces the Golden Freeze.

### Any change that violates a Golden Rule MUST:

1. Be explicitly documented
2. Include justification
3. Include device test evidence
4. Be approved before merge

### Otherwise:

**Change is invalid and must be reverted.**

---

## 7️⃣ LOCKED SCREENS REGISTRY

| Screen               | Type          | Status    | Skeleton     |
| -------------------- | ------------- | --------- | ------------ |
| LoginScreen          | Auth Form     | 🔒 LOCKED | Form         |
| HomeScreen           | Feed          | 🔒 LOCKED | Feed/List    |
| CategoriesScreen     | Product List  | 🔒 LOCKED | Feed/List    |
| ProductDetailsScreen | Detail + CTA  | 🔒 LOCKED | Detail       |
| CartScreen           | Checkout Flow | 🔒 LOCKED | Feed/List    |
| CheckoutScreen       | Form + CTA    | 🔒 LOCKED | Form         |
| OrdersScreen         | History Feed  | 🔒 LOCKED | Feed/List    |
| ProfileScreen        | Account Menu  | 🔒 LOCKED | Menu/Account |

---

## 8️⃣ FINAL DECLARATION

By adopting this document:

- ✅ The app's core structure is frozen
- ✅ Regression risk is minimized
- ✅ Future development remains safe
- ✅ OEM-specific bugs are prevented at the source

### This document overrides:

- ❌ Personal preference
- ❌ "It works on my phone"
- ❌ Short-term hacks

---

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Enforced By:** Engineering Team

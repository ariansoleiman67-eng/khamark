# Reply to App Review — Guideline 2.1, Information Needed

Apple did **not** re-raise 2.3.10. The device-imagery issue is resolved. This is the
standard information request Apple sends for a new app; it is answered, not fixed.

Send items 2–7 below as a Resolution Center reply. Item 1 is a screen recording only
you can make — instructions at the end.

Every fact below was checked against the code, not assumed.

---

## Paste this into App Store Connect

> Hello,
>
> Thank you. The requested information follows. A screen recording is attached.
>
> ---
>
> **2. Devices and operating systems tested**
>
> - iPhone [YOUR MODEL], iOS [YOUR VERSION] — physical device, primary test device
> - iPad, iPadOS 26 — Simulator
> - iPhone, iOS 26 — Simulator
>
> ---
>
> **3. What the app does, and who it is for**
>
> Asankary is the mobile storefront for our retail electronics shop in Erbil, Kurdistan
> Region, Iraq. We sell mobile phones and accessories — earphones, chargers, power banks,
> cables, smartwatches and cases.
>
> The problem it solves: in our region most shopping is done in person or through
> unstructured WhatsApp messages, with no fixed prices and no order history. Customers
> cannot see what is in stock or what anything costs without visiting or messaging us.
>
> Asankary gives our customers a published catalogue with fixed prices and live stock
> levels, an order history they can check at any time, delivery to their address, and a
> direct chat with our shop. The app is fully localised in English, Arabic and Kurdish,
> with right-to-left layout, because our customers use all three languages.
>
> Target audience: general consumers in Iraq buying phones and accessories. There is no
> age-restricted content and the app is not directed at children.
>
> ---
>
> **4. Setting up and accessing the main features**
>
> No login is required to browse. The catalogue, categories, search, product details and
> product chat are all reachable from launch as a guest. An account is only needed to place
> an order.
>
> Demo customer account credentials are in the App Review Information section.
>
> Main flows:
> - **Browse** — Home shows brands and products; Categories filters by type; search is in the header
> - **Product** — tap any product for photos, price, stock, colour and storage options
> - **Cart and checkout** — add to cart, choose a delivery address, choose payment, place the order
> - **Orders** — Profile → My Orders shows status and history
> - **Chat** — the Chat button on a product page opens a conversation with our shop
> - **Account deletion** — Profile → Delete Account, which permanently deletes the account
>
> Payment methods in this version are **Cash on Delivery** and **Money Exchanger**. Both are
> settled offline on delivery; the app takes no payment and there are no in-app purchases,
> subscriptions or paid content of any kind.
>
> ---
>
> **5. External services used**
>
> - **Supabase** — database, authentication and file storage for accounts, products and orders
> - **Firebase Cloud Messaging** — push notifications for order status updates
> - **Firebase Cloud Functions** — our server-side logic
> - **Google Sign-In** — optional sign-in method
> - **Sign in with Apple** — optional sign-in method
> - **OTPIQ** — SMS delivery of the one-time code used to verify a phone number
> - **Google Maps** — showing store and delivery locations
> - **ImgBB** — image hosting for product photographs uploaded by our staff
> - **Bunny CDN** — hosting for product videos
> - **Google Gemini** — powers the in-app shopping assistant, which answers questions about
>   our products, and an optional visual search that finds products from a photo
>
> No advertising or analytics service is used. The app does not track users and never
> requests App Tracking Transparency permission.
>
> ---
>
> **6. Regional differences**
>
> The app behaves identically in all regions. There is no geographic gating of features or
> content. The only variation is user-selectable: three interface languages (English,
> Arabic, Kurdish) and two display currencies (USD and IQD), both changeable at any time in
> the app by any user regardless of location.
>
> We deliver physical goods only within Iraq, but the app itself is fully functional
> everywhere.
>
> ---
>
> **7. Regulated industry or protected third-party material**
>
> Asankary does not operate in a regulated industry. We are a retail shop selling physical
> consumer electronics, paid for on delivery. The app provides no financial, medical, legal
> or gambling services, and handles no payment card data.
>
> All product photographs and descriptions are of stock we hold and sell. Manufacturer names
> such as Honor, Tecno, Motorola and Anker appear solely to identify the goods we retail, in
> the ordinary way a shop lists its inventory.
>
> ---
>
> **Regarding user-generated content:** the in-app chat is between a customer and our shop
> only. Customers cannot see, message or post content visible to other customers, so there
> is no user-to-user content to report or block. There are no public reviews, comments or
> profiles.
>
> Thank you for your time.

---

## Item 1 — the screen recording

Record on your **physical iPhone**, not the Simulator. Apple asks for this specifically.

**How:** Settings → Control Centre → add **Screen Recording**. Swipe down from the
top-right corner, tap the ● button, wait 3 seconds, open Asankary.

**Before recording:** delete the app and reinstall it, and sign out. Apple wants to see the
app from a cold start, including the permission prompts, which only appear the first time.

**Record this order, slowly. Around 3–4 minutes:**

1. **Launch** from the home screen — show the splash and onboarding
2. **Browse as a guest** — Home, then Categories, then open a product
3. **Registration** — Profile → Sign In → Create Account → complete it with a new phone
   number or email. Show the OTP code arriving and being entered.
4. **Permission prompts** — Apple explicitly asks for these. Trigger each one:
   - Notifications — accept the prompt at signup
   - Location — Profile → Addresses → Add Address → "Use my location"
   - Camera and Microphone — open a product → Chat → tap the camera icon, then the
     microphone icon
5. **Place an order** — add to cart → checkout → choose an address → Cash on Delivery →
   place it. Then Profile → My Orders to show it.
6. **Chat** — open a product → Chat → send a message. Say aloud or caption that this goes
   to the shop, not to other users.
7. **Sign out, then sign back in** with the demo account
8. **Account deletion** — Profile → Delete Account → confirm → show that it signs you out
   and the account is gone

Do **not** show the admin/merchant mode. It is not part of the customer experience.

**Uploading:** attach it to the Resolution Center reply with the paperclip icon. If the
file is too large, upload to Google Drive or WeTransfer, set the link so anyone can view,
and paste the link into the reply instead.

---

## Before you send

Fill in your iPhone model and iOS version in item 2 — Settings → General → About shows
both. Everything else is ready to paste as-is.

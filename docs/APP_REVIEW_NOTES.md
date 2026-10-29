# App Review Information — Khamark

Paste sections 2–7 into **App Store Connect → App Review Information → Notes**.
Anything in **[BRACKETS]** only you can fill in.

---

## 2. Devices and operating systems tested

**[FILL IN — Apple requires PHYSICAL devices, not the Simulator. List what you
actually tested on, e.g.:]**

- iPhone [model], iOS [version]
- iPhone [model], iOS [version]
- iPad [model], iPadOS [version]  ← only if you ship an iPad build

---

## 3. What the app does, and who it is for

Khamark is the mobile storefront and back office for Khamark, a mobile accessories
and electronics brand in Erbil, Iraq. Customers browse the shop's real stock, see each
item's price in US dollars or Iraqi dinars, place an order for delivery or
collection, and message the shop directly about a product. The shop's own staff
use the same app to run the business: stock, orders, pricing and customer messages.

The problem it solves: buying accessories and electronics in Iraq usually means visiting shops in
person to ask what is in stock and what it costs, with no written record of the
price, the warranty or whether an item is genuine. Khamark puts
that in writing — every listing states its origin, its condition and its warranty,
prices are shown in both currencies at the shop's own exchange rate, and the order
is tracked in the app.

Audience: shoppers in Iraq buying a phone, earphones or an accessory, and the
shop's own staff. The interface is fully translated into English, Arabic and
Kurdish (Sorani), with right-to-left layout for Arabic and Kurdish.

There are no in-app purchases and no subscriptions. Everything sold is a physical
product, and no payment is taken inside the app: an order is settled on delivery
in cash, or through a money exchanger. The app never handles card details.

---

## 4. How to set up and reach the main features

**Demo account — [FILL IN]:**
- Customer account: phone or email **[…]**, password **[…]**

**[DECIDE: the app also contains a staff back office. Apple asks for credentials
for each account type. Either supply a SEPARATE demo admin account — do not give
out the real shop's login — or state that the back office is staff-only and not
part of the consumer experience. A demo admin account is the safer answer, because
a reviewer who cannot reach a whole half of the app may ask again.]**

Nothing needs to be configured before use. The shop's real catalogue loads on
launch with no sign-in at all.

Main flows:
1. **Browse** — the home screen opens on the live catalogue. Tap any product for
   photos, storage and colour options, specifications, and its origin, condition
   and warranty.
2. **Language and currency** — the globe icon in the header switches between
   English, Arabic and Kurdish. Prices switch between USD and IQD.
3. **Cart and checkout** — add to cart, then choose delivery to an Iraqi city or
   collection, and a payment method (cash on delivery or money exchanger).
   Sign-in is required only at this point.
4. **Orders** — the Orders tab tracks each order's status.
5. **Messages** — a customer can message the shop about a specific product. This
   is a private one-to-one conversation with the shop; there is no public feed and
   no messaging between customers.
6. **Trade-in** — a customer can offer a used phone by describing it and attaching
   photos. The shop replies with a price.
7. **Account deletion** — Profile → the delete-account action removes the account
   and its data from within the app, with no email or phone call required.

---

## 5. External services used

| Service | What it does here |
|---|---|
| Supabase (Postgres, Auth, Storage, Edge Functions) | The app's database, sign-in, uploaded images and server-side logic |
| Firebase Cloud Messaging | Push notifications for order status changes |
| Firebase Authentication | Phone-number sign-in by SMS one-time code |
| OTPIQ | Delivers those SMS codes inside Iraq |
| Google Sign-In | Optional sign-in method |
| Google Maps | Picking and displaying a delivery address |
| Anthropic (Claude) | The in-app shopping assistant that answers product questions, and image-based product search |
| Bunny CDN | Hosts product videos |

No advertising networks, no analytics SDKs, and no third-party trackers.

---

## 6. Regional differences

The app behaves identically in every region — there is no geographic gating, no
region-specific feature, and no content that changes by country.

Its content is Iraq-focused because the shop is in Erbil: delivery destinations are
Iraqi cities, prices show in US dollars and Iraqi dinars, and payment options are
the ones used locally. All of that is visible from anywhere; a reviewer outside
Iraq sees exactly what a customer in Erbil sees.

---

## 7. Regulated industry / third-party material

Khamark is an ordinary retail shop selling consumer electronics. It is not in a
regulated industry.

Product names, images and specifications are manufacturer material for the
handsets and accessories the shop stocks and resells, used to describe goods it
actually sells. No payment is taken in the app and no card details are collected
or stored — every order is settled offline, on delivery or through a money
exchanger.

---

## Permissions the app asks for, and why

Useful to include — Apple's note calls out purpose strings (Guideline 5.1.1).

- **Location** — to fill in a delivery address and to show the shop's locations.
- **Camera / Photos** — to attach photos of a used phone to a trade-in request, and
  to set a profile picture.
- **Microphone** — to send a voice message to the shop in chat.
- **Notifications** — order status updates.

---

# 1. The screen recording — shot list

Record on a **physical iPhone**, not the Simulator. Apple says so explicitly, and a
Simulator recording is itself grounds for another round. Settings → Control Centre →
add Screen Recording, then swipe down and hit record. One continuous take is best;
5–8 minutes is plenty. No narration needed.

**Start with the app closed.** The recording must begin with the launch.

1. **Launch** — tap the icon from the home screen. Let the splash and home screen
   load fully.
2. **Browse** — scroll the home screen. Open a product. Scroll through its photos,
   pick a storage size and a colour, scroll down to the specifications.
3. **Language** — tap the globe, switch to Arabic. Show the layout flip. Switch to
   Kurdish, then back to English. *(This is worth showing: it demonstrates the app
   is genuinely three-language, which the screenshots cannot.)*
4. **Registration** — Profile → create a new account. Go through the whole flow
   including the SMS code. Apple asked for registration explicitly.
5. **Login** — sign out, then sign back in with the demo account you put in the
   Notes. Show it working.
6. **A permission prompt** — trigger at least one. The easiest is checkout →
   delivery address → allow location, or trade-in → attach a photo → allow camera.
   Apple asked to see the prompts.
7. **Buy something** — add to cart, open the cart, checkout, choose a delivery city,
   choose Cash on Delivery, place the order. Then open Orders and show it there.
   *(Use cash on delivery — do not put a real card through it. There is no in-app
   purchase to show, because everything sold is a physical product.)*
8. **User-generated content and moderation** — open Messages, send the shop a
   message. Then show the block control in the conversation. Apple asked for
   "content reporting and blocking mechanisms" and this is where yours lives.
9. **Account deletion** — Profile → delete account. Show the confirmation. Do this
   on a throwaway account, not the demo one you gave them. Apple asked for it, and
   Guideline 5.1.1(v) requires it to exist.
10. **The back office** — *[only if you give them an admin demo account]* sign in as
    admin, show Products and Orders. Keep it brief.

Order 1–9 is the order Apple listed them in. Do not skip 4, 8 or 9 — those three
are the ones they named specifically.

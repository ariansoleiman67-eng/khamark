# Reply to App Review — Guideline 2.3.10, submission 9abe788a-11c3-4c5d-b07e-ddaacaa0a1a6

Send this in App Store Connect → Resolution Center, **with** the new build 1.0 (5).
Do not send it on its own: Apple asked for a binary change, and this reply is credible
only because the binary genuinely changed.

Apple's own message invites this: *"Reply to App Review in App Store Connect with
additional information if the app's functionality and how it interacts with third-party
platforms has been misunderstood."*

---

## The message to paste

> Hello,
>
> Thank you for the detailed feedback on build 1.0 (4). We have submitted build 1.0 (5),
> which addresses the issue, and we would like to explain what was in the binary and what
> has changed.
>
> **What we removed.** This app was built by a team that had previously produced an
> unrelated automotive-parts app, and imagery from that project remained bundled in the
> 1.0 (4) binary. We have now removed all of it, including a vehicle animation used on the
> launch screen, that company's logo which appeared inside our AI assistant, and several
> unused product images. We reviewed every image file that ships in the binary
> individually. The app binary now contains no photographs of any device or hardware at
> all — only our own logo, interface icons, and generic delivery artwork. Total bundled
> image assets went from 35 MB to 1.3 MB.
>
> **What the screenshot shows.** Asankary is a retail store in Erbil, Iraq. We sell
> consumer electronics — phones, earphones, chargers, power banks, cables and accessories —
> and the app is our shop's storefront. The product photographs visible in your screenshot
> are listings of merchandise we have in stock and sell to customers, loaded at runtime
> from our own product catalogue. They are not bundled in the binary, and they are not a
> reference to, promotion of, or comparison with any other platform.
>
> **We do not reference any other platform.** The app contains no mention of Android or
> Google Play anywhere a user can see on iOS, no "also available on" messaging, no
> platform logos or badges, and no links to any other app store. We have verified this
> against the shipped bundle.
>
> If our understanding is wrong and product photography of merchandise a retailer sells is
> itself within the scope of 2.3.10, we would be grateful if you could confirm that, so we
> can adjust our catalogue presentation accordingly. We want to comply fully and we are
> happy to make further changes.
>
> Thank you for your time.

---

## Before you send it — one thing that makes it far stronger

Right now your live catalogue is **14 products, 12 of them Android phones** (8 Honor,
3 Tecno, 1 Motorola) and 2 accessories. That is why the reviewer's screenshot was
wall-to-wall Android handsets: it is almost the whole shop.

The reply above is true, but a reviewer opening the app still sees what looks like an
Android-phone app. **Add your Apple and accessory stock to the catalogue before
resubmitting** — iPhones, AirPods, cases, chargers, cables, screen protectors, power
banks, smartwatches. You sell these; they just are not in the app yet.

You can add them yourself in the admin section (tap the logo five times on the sign-in
screen → your admin account → Products). Even 15–20 more items would change the first
screen from "Android phones" to "an electronics shop", which is what the app actually is.

This is the single highest-value thing you can do, and it needs no code change from me.

---

## If Apple rejects it again on the same guideline

Do not resubmit the same argument twice. Instead, reply asking for a phone call — App
Review grants these, and a five-minute conversation with a human resolves ambiguous
cases like this far faster than another written round trip. Say plainly that you are a
retail shop, that the images are inventory, and ask what presentation would satisfy them.

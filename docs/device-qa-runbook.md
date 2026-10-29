# Khamark remaining device and staging QA

Status at handoff: **NOT RUN** for all native screen, real-service and store-console checks below. The CSV is a source inventory, not a completed native test run.

Use a disposable Khamark staging project and synthetic accounts/catalogue. Provide a custom development build and a release-like preview build for both iOS and Android. Native Firebase is outside Expo Go. Do not use or reset Asankary production.

## Test fixtures

Create two unrelated customers, one VIP, one blocked customer, a read-only partner, an owner and a second store/admin for isolation tests. Use products with base-only, size-only, color-only and combined options; shared stock of 5; stock of 0 and 1; USD-only and IQD-authored prices; tiers/VIP/compare-at; long localized names; one and multiple images; intentional missing/failed images. Use a catalogue larger than 1,000 records and offers beyond the first 500.

For each screen record platform/OS/device, app build/commit, role, route, theme/language, initial data, steps, expected/actual result, screenshot/video or log, finding ID and PASS/FAIL/BLOCKED. Mark helper-only modules NOT APPLICABLE with a reason. Review navigation to identify actual reachable routes and modals.

## Screen matrix

Use screen-coverage.csv to ensure no source module is lost. Grouped test journeys supplement, rather than replace, checking individual reachable routes.

| Flow | Required steps and states |
|---|---|
| Splash/onboarding/navigation | Cold/warm launch, no config, offline launch, first-time/returning install; logo sharpness, no flash/freeze, reduced motion, active raised tab for every selection, safe areas and Android back |
| Home/brands/categories/store | Banner and brand loading/failure, long names, empty categories, brand selection below banner, scroll restoration, pagination, refresh and failed images |
| Search/offers/barcode | Empty/query/no result, late-page records, filters/sort/reset, rapid typing/out-of-order responses, cancelled navigation, camera denied, invalid barcode and valid late-page product |
| Product and quantity controls | Full gallery, zoom/swipe/fallback, multiple aspect ratios, correct variant image/price, stock 0/1/5, every card stepper, variant selection, rapid taps, cart/product count synchronization and large prices |
| Wishlist/cart | Guest add/remove/persistence, single-store rule, options stay separate, 2+2+2 against 5, quantity update, batch 3+3 against 5, restart, guest merge, account A→B, storage-full failure and sync recovery |
| Checkout | No address/add/edit/switch, invalid address, country/region shipping, price/FX/coupon change confirmation, VIP/tier math, enabled payment options only, duplicate taps, lost-response retry, app killed mid-submit |
| Orders/invoices/tracking | Empty/loading/error/history, correct customer scope, complete totals, long items, status refresh, invoice export/share, cancel once/retry/race, tracking access, private data excluded from other users |
| Auth/recovery | Email/phone/OAuth signup/login, wrong/expired OTP, resend cooldown, lookup outage, recovery cold/warm link, cancelled browser, token refresh, offline same-user restore, sign-out, account switch and blocked token |
| Profile/security/addresses | Edit validation, verified phone/email changes, reauth cancellation/failure, password change, address defaults, language/theme persistence, support links and complete deletion/retention lifecycle |
| Chat/AI/trade-in | Empty/history/realtime, upload/camera/mic denied, private attachment access, failed send/retry/deduplication, voice/media playback, AI budget/timeout/stream interruption, trade-in submit/status and admin reply |
| Admin dashboard/orders/POS | Accurate counts, status filters, pagination, create/cancel/edit paths, exact USD/IQD totals, payments/retries, refunds if supported, permission denial and cross-store isolation |
| Admin products/inventory | Create/edit/delete, barcode/category/brand, variants/prices/costs/stock, multiple image/video upload failures, bulk changes, simultaneous stock updates, missing variants and insufficient stock |
| Admin reports/analytics | Date/currency filters, empty/error/large dataset, known fixture totals, refunds/cancels, cost visibility, export and partner scope |
| Admin promotions/branding | Coupon eligibility/caps/use limit/concurrent redemption, expiry, banner/brand/category ordering, media replacement and shopper refresh consistency |
| Admin customers/partners | VIP/block changes, owner-only management, readonly partner restrictions by direct API, assignment/removal and no cross-customer/tenant data leakage |
| Admin settings/security | Store/company/contact/location/hours, currency/shipping/invoice changes, password/re-auth, failure rollback and propagation without stale values |
| Notifications | Permission grant/deny, real per-device opt-out, foreground/background/killed app, order/promo/chat deep links, badge clearing, account change and stale token retirement |

## Cross-cutting visual and resilience checks

- Run light/dark × English/Arabic/Kurdish on both platforms. Include long translated labels, RTL tab animation and mixed-direction SKU/phone/currency strings.
- Check small phones, larger phones/tablets where supported, display scaling and maximum supported accessibility type. Use VoiceOver/TalkBack focus order, meaningful labels, enabled/disabled announcements and contrast inspection.
- Test keyboards, multiline input scrolling, safe areas, modals/bottom sheets, screen rotation if supported and Android hardware/system back. Confirm fixed purchase bars never cover fields/actions.
- Exercise initial loading, empty, offline, slow requests, HTTP errors, timeout, retry, stale cache and request completion after screen unmount. No infinite spinners, invisible error state, false success or unhandled rejections.
- Test image failed fetch/cache, large uploads, PNG/HEIC/JPEG, permission denial, interrupted upload, video/voice failures and storage quota failure.
- Use release-like builds to measure startup, scrolling frame times, memory and network requests on representative hardware. Record measurements, not a subjective “smooth.”

## Direct backend security and race tests

With anon/customer/partner/admin identities, call the API directly: arbitrary stock delta, forged order total/paid status, cross-tenant inventory, cross-user profile/order/device/media, secret settings/costs and tracking. Verify denial before testing legitimate paths.

Race the final stock unit, coupon final use, duplicate checkout submissions, response-loss retry, simultaneous payment poll/webhook and repeated cancellation. Verify one financial outcome and correct stock. Use sandbox payment events only.

Verify deletion using a fixture containing profile, addresses, private chat/media, devices/tokens and completed orders. Record retained data/purpose/access separately. Retry after partial cleanup failure. Verify owner deletion has a documented support/ownership path.

## Release evidence and decision

A release candidate needs actual native build/install results, staging permissions/schema tests, completed critical device journeys, enabled integration results, dependency disposition and unresolved-risk list. Review support/privacy URLs, identifiers, signing and feature-matched store metadata in the real owner consoles. Obtain owner-approved business/policy text.

Do not call a blocked integration passed. Do not publish until P0/P1 findings are resolved and required checks have evidence.

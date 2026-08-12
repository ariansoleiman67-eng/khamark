# Patch for the published privacy policy

**Page:** https://asankarye-hub.github.io/asankary-legal/
**Repo:** the `asankary-legal` repository under the `asankarye-hub` GitHub account
**File:** `index.html`

This does **not** need a new app build. It can be published at any time, including
after the app is submitted. Do it before submitting anyway — App Review opens this page.

---

## Why

The page is otherwise accurate and well written. Supabase, Firebase Cloud Messaging,
Google Sign-In, OTPIQ and Google Maps are all genuinely used, and the rights section
correctly describes in-app account deletion.

One section is not true. Under **Tracking** the page says:

> On iOS, the app may ask for permission to track using the device advertising
> identifier, in order to measure the performance of our advertising.

The app does none of that. Verified against the code:

- `expo-tracking-transparency` is listed in `package.json` but is **never imported
  anywhere**, so the App Tracking Transparency prompt is never shown.
- `app.config.ts` deliberately omits `NSUserTrackingUsageDescription`, so iOS could
  not present that prompt even if something asked.
- The advertising identifier is never read — there is no reference to it in the
  codebase.
- There is no advertising in the app, and no advertising network SDK is installed.

Reviewers compare the privacy policy against the App Privacy answers in App Store
Connect. Promising a tracking prompt that the app never shows is a contradiction they
look for, and it is a Guideline 5.1.1 problem.

---

## The change

**Find this block in `index.html`:**

```html
<h2>Tracking</h2>
<p>
  On iOS, the app may ask for permission to track using the device advertising identifier, in order
  to measure the performance of our advertising. You can decline, and you can change this at any
  time in <code>Settings → Privacy &amp; Security → Tracking</code>. Declining does not limit any
  feature of the app.
</p>
```

**Replace it with this:**

```html
<h2>Tracking and advertising</h2>
<p>
  We do not track you. Asankary shows no advertising, contains no advertising or analytics
  SDK, and never accesses your device's advertising identifier. Because we do not track,
  the app never shows Apple's App Tracking Transparency prompt.
</p>
<p>
  We do not follow you across other companies' apps or websites, and we do not sell or
  share your personal information for advertising purposes.
</p>
```

That is the only required change.

---

## Optional, while you are in the file

The **Information we collect** list mentions *date of birth* under profile details. The
app has a `dateOfBirth` field defined in its data types, but no screen asks for one. If
you are not collecting it, remove those two words so the page stays exactly true.

---

## After publishing

GitHub Pages takes a minute or two to rebuild. Check the live page shows the new
wording before you submit, and make sure your App Store Connect **App Privacy** answers
say the app does **not** use data to track — they must agree with this page.

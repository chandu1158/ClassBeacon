# ClassBeacon — App Check & Hardening Guide

## 1. Firebase App Check Setup

Firebase App Check helps protect your backend resources from abuse (such as billing exhaustion or unauthorized scraping) by attesting that incoming requests originate from your authentic application.

### Step 1: Enable App Check in Console
1. Navigate to **Firebase Console** -> **Build** -> **App Check**.
2. Register your web application.
3. Select your provider (e.g. **reCAPTCHA Enterprise** or **reCAPTCHA v3**).

### Step 2: Initialize App Check in Web Client (`apps/web/src/lib/firebase.ts`)
```typescript
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

if (import.meta.env.PROD) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('YOUR_RECAPTCHA_SITE_KEY'),
    isTokenAutoRefreshEnabled: true,
  });
}
```

### Step 3: Monitor Mode -> Enforcement
1. Keep App Check in **Unenforced / Monitor Mode** for 1–2 weeks.
2. Review metrics in the Firebase Console to ensure legitimate users are not blocked.
3. Switch enforcement on for Cloud Firestore once verified.

---

## 2. Google Cloud API Key Referrer Restrictions

Although Firebase Web API keys are identifiers (not secrets), you should restrict them to prevent quota theft:

1. Open [Google Cloud Console API Credentials](https://console.cloud.google.com/apis/credentials).
2. Select your Firebase API key (`AIzaSyCxceW4yg...`).
3. Under **Application restrictions**, select **Websites**.
4. Add your authorized domains:
   - `https://communicationpath-e5990.web.app/*`
   - `https://communicationpath-e5990.firebaseapp.com/*`
   - `https://your-custom-domain.com/*`
5. Save changes.

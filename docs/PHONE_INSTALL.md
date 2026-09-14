# Install LiftLog on a Phone

LiftLog is a Progressive Web App. The hosted app, installation, offline cache, and local workout storage cost $0.

## Published App

The deployment workflow publishes the `main` branch to:

`https://omarovski-27.github.io/liftlog-pwa/`

Every push runs lint, tests, and a production build before GitHub Pages updates the app.

## iPhone or iPad

1. Open the published app in Safari.
2. Tap Share.
3. Choose **Add to Home Screen**.
4. Tap **Add**.

## Android

1. Open the published app in Chrome.
2. Tap **Install app** when LiftLog offers it. If the prompt is not shown, open Chrome's menu and choose **Install app** or **Add to Home screen**.
3. Confirm the installation.

## Move Existing Data

Browser storage belongs to one device and one web address. Existing workouts at a local development address do not automatically appear at the published address.

1. In the old LiftLog app, open **Program** and select **Export backup**.
2. Send the JSON backup to the phone using Files, email, Drive, or another private transfer method.
3. In the published app on the phone, open **Program** and select **Import backup**.
4. Choose **Merge** for the normal transfer. Use **Replace all** only when the phone should exactly match the backup.
5. Install LiftLog from the browser after confirming the restored workouts are present.

## Storage and Updates

- Programs, workouts, and history stay in IndexedDB on that device.
- No LiftLog account, server, subscription, or paid database is used.
- The installed app opens offline after its first successful load.
- Export a backup periodically and before clearing browser data or changing phones.

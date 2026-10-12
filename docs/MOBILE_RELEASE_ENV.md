# Mobile Release environment

Both native Release variants use the checked-in `.env.production` file. It contains only public endpoint settings—no API keys, tokens, passwords, or signing material. These URLs are compiled into the mobile app and are not secrets.

- REST: `https://api.balakovo-go.ru/api`
- Socket.IO: `https://api.balakovo-go.ru`
- Realtime: enabled

Android `release` selects `.env.production` through `react-native-config`; `preReleaseBuild` validates its exact allowed keys and values. Android Debug keeps the existing default `.env` behavior. iOS Release sets `ENVFILE=.env.production` and validates it before bundling; iOS Debug selection is unchanged. The validator rejects localhost, HTTP, other hosts, credentials, and any extra env entries (including provider keys).

Run the config tests before building:

```sh
npm run test:mobile-release-env
```

Release build commands after the platform prerequisites are installed:

```sh
ENVFILE=.env.production xcodebuild \
  -workspace ios/RoadRadar.xcworkspace \
  -scheme RoadRadar \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /tmp/OnMap.xcarchive archive

cd android && ./gradlew :app:assembleRelease
```

Android signing credentials belong in a protected build environment and must not be added to `.env.production`. iOS signing requires the selected Apple Developer team, certificate, and provisioning setup. This endpoint configuration does not by itself make either Release artifact distributable.

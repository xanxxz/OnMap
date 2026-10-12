# Android release signing

Release variants use a dedicated signing config and never use the debug key.
Supply the release keystore through environment variables available to the
Gradle process before building:

- `ONMAP_RELEASE_STORE_FILE` — absolute path to the keystore;
- `ONMAP_RELEASE_STORE_PASSWORD`;
- `ONMAP_RELEASE_KEY_ALIAS`;
- `ONMAP_RELEASE_KEY_PASSWORD`.

Keep the keystore and all four values in a CI secret manager or a protected
shell/IDE environment. Do not commit them, add them to `.env`, or pass them on
the command line. The Android `react-native-config` Gradle script copies every
key in `.env` into generated BuildConfig/resources, which are packaged into the
APK; release signing secrets must therefore never be stored there. The current
local `.env` contains none of the four signing variable names.

If they are absent or invalid, Gradle must not produce a signed release APK;
debug builds continue to use the normal debug key. Gradle reads the signing
values directly with `System.getenv`; they are not intentionally added to app
BuildConfig or resources. Before distribution, inspect the release APK and its
build logs to confirm that no signing material was packaged or printed.

Build after Java and Android SDK are installed with:

```sh
cd android
./gradlew :app:assembleRelease
```

Verify the resulting APK's signer with Android Build Tools
`apksigner verify --print-certs <path-to-apk>` before distribution. Back up the
release keystore securely: updates to an installed APK must retain the same
signing identity. The keystore and credentials have not been created in this
repository.

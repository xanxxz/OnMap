function publicLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

// Local, versioned release asset in public/. Hosting serves it at this stable path.
export const androidApkUrl = '/onmap/downloads/onmap-android.apk';
export const appStoreUrl = publicLink(process.env.NEXT_PUBLIC_APP_STORE_URL);

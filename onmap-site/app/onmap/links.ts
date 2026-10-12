function publicLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const androidApkUrl = publicLink(process.env.NEXT_PUBLIC_ANDROID_APK_URL);
export const appStoreUrl = publicLink(process.env.NEXT_PUBLIC_APP_STORE_URL);

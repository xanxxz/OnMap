import type { Metadata } from 'next';
import { DocumentPage, contentStyles as s } from '../components/DocumentPage';
import { androidApkUrl, appStoreUrl } from '../links';

export const metadata: Metadata = { title: 'Скачать OnMap', description: 'Установка OnMap на Android и ссылка на App Store, когда она доступна.' };

export default function Download() {
  return <DocumentPage eyebrow="Приложение" title="Скачать OnMap" intro="Здесь появятся ссылки на доступные версии приложения.">
    <section className={s.platform}><h2>Android</h2><div>{androidApkUrl ? <><p>Скачайте APK по ссылке ниже. Откройте файл на устройстве и следуйте подсказкам Android. Перед установкой проверьте, что файл получен по ссылке с этой страницы.</p><a className={s.action} href={androidApkUrl}>Скачать APK ↗</a></> : <><p>Файл для установки пока не опубликован.</p><span className={s.disabled} aria-disabled="true">Android — скоро</span></>}</div></section>
    <section className={s.platform}><h2>App Store</h2><div>{appStoreUrl ? <a className={s.action} href={appStoreUrl}>Открыть App Store ↗</a> : <><p>Ссылка на приложение пока не опубликована.</p><span className={s.disabled} aria-disabled="true">App Store — скоро</span></>}</div></section>
    <p className={s.muted}>Если нужна помощь с установкой, напишите в <a href="https://t.me/onMapSupport">поддержку OnMap</a>.</p>
  </DocumentPage>;
}

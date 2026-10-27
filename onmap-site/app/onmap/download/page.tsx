import type { Metadata } from 'next';
import Link from 'next/link';
import { AndroidLogo, AppleLogo, ArrowDown, ArrowUpRight, CaretDown, RoadHorizon, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { Shell } from '../components/SiteShell';
import { androidApkUrl } from '../links';
import s from '../utility.module.css';

export const metadata: Metadata = { title: 'Скачать OnMap', description: 'Скачайте официальный APK OnMap для Android и узнайте, как установить приложение.' };

const androidVersion = '1.0';
const androidBuild = '1';
const androidSha256 = 'dac1e85999197f43f46a81e43479e423c441266306841e53a656aae697fb03b1';

const installation = [
  { title: 'Скачайте APK', description: 'Нажмите кнопку выше, чтобы скачать файл OnMap.' },
  { title: 'Откройте файл', description: 'Найдите скачанный файл в приложении «Загрузки».' },
  { title: 'Подтвердите установку', description: 'Если Android попросит разрешение, разрешите установку приложений из этого источника.' },
];

export default function Download() {
  return <Shell compact>
    <main id="main" className={s.page}>
      <div className={s.downloadLayout}>
        <div className={s.downloadIntro}>
          <h1 className={s.downloadTitle}>Скачать <br />OnMap</h1>
          <p className={s.lead}>Выберите версию для своего устройства.</p>
          <Link className={s.helpLink} href="/onmap/support/">Помощь с установкой <ArrowUpRight size={20} aria-hidden="true" /></Link>
        </div>

        <section className={s.androidPanel} aria-labelledby="android-title">
          <div className={s.platformHeading}>
            <AndroidLogo className={s.androidIcon} size={84} weight="fill" aria-hidden="true" />
            <div><h2 id="android-title">Android</h2><p>Версия {androidVersion} · APK · 123 МБ</p><span className={s.build}>Сборка {androidBuild}</span></div>
          </div>
          {androidApkUrl ? <a className={s.primaryAction} href={androidApkUrl} download>Скачать APK <ArrowDown size={29} aria-hidden="true" /></a> : <span className={s.unavailable} aria-disabled="true">Android · скоро</span>}

          <div className={s.installation}>
            <h3>Как установить</h3>
            <ol className={s.installSteps}>
              {installation.map((step, index) => <li key={step.title}>
                <span className={s.stepNumber}>{String(index + 1).padStart(2, '0')}</span>
                <div><h4>{step.title}</h4><p>{step.description}</p></div>
              </li>)}
            </ol>
            <p className={s.releaseNote}>Чтобы обновить OnMap, установите APK поверх прежней версии и не удаляйте приложение.</p>
          </div>

          <details className={s.hashDisclosure}>
            <summary><ShieldCheck size={29} aria-hidden="true" /><span>SHA-256 и проверка файла</span><CaretDown className={s.disclosureChevron} size={23} aria-hidden="true" /></summary>
            <div className={s.hashContent}>
              <p>SHA-256 файла:</p><code>{androidSha256}</code>
              <p>APK подписан ключом OnMap; подпись и файл проверены перед публикацией.</p>
              <p>Установка на физическом Android-устройстве перед публикацией не проверялась.</p>
            </div>
          </details>
        </section>
      </div>

      <section className={s.iosPanel} aria-labelledby="ios-title">
        <div className={s.platformHeading}><AppleLogo className={s.appleIcon} size={69} weight="fill" aria-hidden="true" /><div><h2 id="ios-title">iPhone</h2><p>App Store · скоро</p></div></div>
        <span className={s.unavailable} aria-disabled="true">App Store · скоро</span>
      </section>

      <p className={s.roadNote}><RoadHorizon size={32} aria-hidden="true" /><span>Данные могут устареть. Смотрите на дорогу и знаки.</span></p>
    </main>
  </Shell>;
}

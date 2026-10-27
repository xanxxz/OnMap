import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import GoHeader from '../components/GoHeader';
import GoFooter from '../components/GoFooter';
import OnMapArtwork from '../components/OnMapArtwork';
import styles from './sssvam.module.css';

export const metadata: Metadata = {
  title: 'sssvam — независимый разработчик',
  description: 'Придумываю, делаю и запускаю цифровые проекты.',
  icons: { icon: '/brand/sssvam-favicon-v1.svg', apple: '/brand/sssvam-apple-touch.png' },
  openGraph: {
    title: 'sssvam',
    description: 'Придумываю. Делаю. Запускаю.',
    images: [{ url: '/brand/og-sssvam.png', width: 1200, height: 630, alt: 'sssvam' }],
  },
};

export default function Sssvam() {
  return (
    <div className={styles.page}>
      <GoHeader variant="author" />
      <main id="main">
        <section className={styles.hero} aria-labelledby="sssvam-title">
          <Image
            className={styles.heroRibbon}
            src="/art/sssvam-ribbon-transparent.webp"
            alt=""
            width={1584}
            height={993}
            priority
            sizes="(max-width: 700px) 600px, 78vw"
          />
          <div className={styles.heroContent}>
            <h1 id="sssvam-title">sssvam</h1>
            <div className={styles.heroIntro} id="about">
              <p>Независимый разработчик</p>
              <strong>Придумываю. Делаю. Запускаю.</strong>
              <a className={styles.textLink} href="#work">Мои работы <span aria-hidden="true">↘</span></a>
            </div>
          </div>
        </section>

        <section className={styles.work} id="work" aria-labelledby="work-title">
          <div className={styles.workInner}>
            <h2 id="work-title">Из идей — в дело<span>.</span></h2>

            <article className={`${styles.project} ${styles.projectOnmap}`} aria-labelledby="onmap-title">
              <div className={styles.onmapVisual}>
                <OnMapArtwork alt="OnMap: дорожные события отмечены на карте в приложении" sizes="(max-width: 700px) 100vw, 54vw" />
              </div>
              <div className={styles.onmapCopy}>
                <h3 id="onmap-title">OnMap</h3>
                <p>Дорожные события рядом</p>
                <Link className={styles.textLink} href="/onmap/">Открыть <span aria-hidden="true">↗</span></Link>
              </div>
            </article>

            <article className={`${styles.project} ${styles.projectBgo}`} id="balakovo-go" aria-labelledby="bgo-title">
              <div className={styles.bgoCopy}>
                <h3 id="bgo-title">Балаково Go</h3>
                <p>Проекты для своего города</p>
                <Link className={styles.textLink} href="/">Открыть <span aria-hidden="true">↗</span></Link>
              </div>
              <div className={styles.bgoVisual}>
                <Image
                  src="/art/balakovo-go-device-cutout.png"
                  alt="Главная страница Балаково Go на экране"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 700px) 100vw, 60vw"
                />
              </div>
            </article>
          </div>
        </section>

        <section className={styles.finale} aria-label="Вернуться на главную">
          <div className={styles.finaleInner}>
            <div>
              <h2>Ещё увидимся<span>.</span></h2>
              <p>sssvam</p>
            </div>
            <Link className={styles.finaleButton} href="/">На главную <span aria-hidden="true">↗</span></Link>
          </div>
        </section>
      </main>
      <GoFooter variant="author" />
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import styles from './site.module.css';

export const metadata: Metadata = {
  title: 'balakovo-go.ru — главная',
  description: 'Главная страница balakovo-go.ru. Сейчас здесь доступен проект OnMap.',
};

export default function Home() {
  return <div className={styles.site}>
    <a className={styles.skip} href="#main">К содержанию</a>
    <header className={styles.header}>
      <Link className={styles.wordmark} href="/">balakovo-go.ru</Link>
      <nav aria-label="Основная навигация"><Link className={styles.headerLink} href="/onmap/">Открыть OnMap <span aria-hidden="true">↗</span></Link></nav>
    </header>
    <main id="main">
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroText}>
          <p className={styles.kicker}>Главная страница</p>
          <h1 id="home-title">Здесь начинается <em>balakovo-go.ru</em></h1>
          <p className={styles.lead}>Сейчас на сайте доступен OnMap — карта дорожных событий. У приложения свой раздел со страницей загрузки, поддержкой и документами.</p>
          <Link className={styles.primaryLink} href="/onmap/">Перейти в OnMap <span aria-hidden="true">↗</span></Link>
        </div>
        <div className={styles.heroAside} aria-hidden="true"><span>01</span><span>Доступный проект</span><div className={styles.line} /></div>
      </section>
      <section className={styles.project} aria-labelledby="project-title">
        <div className={styles.projectText}>
          <span className={styles.projectIndex}>01 / OnMap</span>
          <h2 id="project-title">Дорожные события<br/>на одной карте</h2>
          <p>Смотреть отметки, добавлять события и помогать другим понять, остаётся ли информация актуальной.</p>
          <Link className={styles.textLink} href="/onmap/">О проекте <span aria-hidden="true">↗</span></Link>
        </div>
        <div className={styles.projectVisual}>
          <Image src="/map-atlas.svg" alt="Иллюстрация карты дорог и реки" fill sizes="(max-width: 800px) 100vw, 45vw" />
          <span className={styles.visualLabel}>OnMap · иллюстрация карты</span>
        </div>
      </section>
    </main>
    <footer className={styles.footer}><span>balakovo-go.ru</span><Link href="/onmap/">OnMap <span aria-hidden="true">↗</span></Link></footer>
  </div>;
}

import Image from 'next/image';
import Link from 'next/link';
import styles from '../onmap.module.css';

export function Header() {
  return <header className={styles.header}>
    <div className={styles.headerInner}>
      <Link className={styles.siteBack} href="/">← <span>balakovo-go.ru</span></Link>
      <Link className={styles.brand} href="/onmap/" aria-label="OnMap — главная страница приложения"><Image src="/app-icon.png" alt="" width={37} height={37} />OnMap</Link>
      <nav className={styles.nav} aria-label="Навигация OnMap">
        <Link href="/onmap/#map">События</Link><Link href="/onmap/#community">Как это работает</Link><Link href="/onmap/support/">Поддержка</Link><Link className={styles.navAction} href="/onmap/download/">Скачать <span aria-hidden="true">↗</span></Link>
      </nav>
    </div>
  </header>;
}

export function Footer() {
  return <footer className={styles.footer}>
    <div className={styles.footerTop}><Link className={styles.footerBrand} href="/onmap/">OnMap</Link><p>Дорожные события на карте.<br/>Информация носит справочный характер.</p></div>
    <nav className={styles.footerLinks} aria-label="Страницы OnMap">
      <Link href="/onmap/download/">Скачать</Link><Link href="/onmap/privacy/">Конфиденциальность</Link><Link href="/onmap/terms/">Условия</Link><Link href="/onmap/community-rules/">Правила сообщества</Link><Link href="/onmap/support/">Поддержка</Link>
    </nav>
    <Link className={styles.footerBack} href="/">← На главную balakovo-go.ru</Link>
  </footer>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <div className={styles.site}><a className={styles.skip} href="#main">К содержанию</a><Header />{children}<Footer /></div>;
}

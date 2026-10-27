import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { MobileNav } from './MobileNav';
import styles from '../onmap.module.css';

export function Header({ compact = false }: { compact?: boolean }) {
  return <header className={`${styles.header} ${compact ? styles.utilityHeader : ''}`}>
    <div className={styles.headerInner}>
      <Link className={styles.siteBack} href={compact ? '/onmap/' : '/'}><ArrowLeft size={20} aria-hidden="true"/><span>{compact ? 'К OnMap' : 'balakovo-go.ru'}</span></Link>
      <Link className={styles.brand} href="/onmap/" aria-label="OnMap — главная страница приложения"><Image src="/brand/onmap-logo.svg" alt="" width={220} height={64} priority /></Link>
      {!compact && <><nav className={styles.navDesktop} aria-label="Навигация OnMap"><Link href="/onmap/#map">Карта</Link><Link href="/onmap/#how-it-works">Как работает</Link><Link href="/onmap/support/">Поддержка</Link><Link className={styles.navAction} href="/onmap/download/">Скачать <ArrowUpRight size={19} aria-hidden="true"/></Link></nav><MobileNav /></>}
    </div>
  </header>;
}

export function Footer() {
  return <footer className={styles.footer}>
    <Link className={styles.footerBrand} href="/onmap/" aria-label="OnMap — главная страница приложения"><Image src="/brand/onmap-logo.svg" alt="" width={220} height={64}/></Link>
    <nav className={styles.footerLinks} aria-label="Страницы OnMap"><Link href="/onmap/download/">Скачать</Link><Link href="/onmap/support/">Поддержка</Link><Link href="/onmap/privacy/">Конфиденциальность</Link><Link href="/onmap/terms/">Условия</Link><Link href="/onmap/community-rules/">Правила</Link><Link className={styles.footerBack} href="/">balakovo-go.ru <ArrowUpRight size={17} aria-hidden="true"/></Link></nav>
  </footer>;
}

export function Shell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return <div className={styles.site}><a className={styles.skip} href="#main">К содержанию</a><Header compact={compact}/>{children}<Footer /></div>;
}

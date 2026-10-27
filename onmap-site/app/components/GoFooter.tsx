import Image from 'next/image';
import Link from 'next/link';
import styles from './go-shell.module.css';

export default function GoFooter({ variant = 'site' }: { variant?: 'site' | 'author' }) {
  const author = variant === 'author';
  return <footer className={styles.footer}>
    <div className={styles.footerMain}>
      <Link className={styles.footerBrand} href={author ? '/sssvam/' : '/'} aria-label={author ? 'sssvam — начало страницы' : 'Балаково Go — главная'}><Image src={author ? '/brand/sssvam-logo-light.svg' : '/brand/bgo-logo-light.svg'} alt="" width={author ? 208 : 267} height={author ? 44 : 48} /></Link>
      <span className={styles.footerDivider} aria-hidden="true" />
      <span className={styles.footerLocation}>Балаково, Саратовская область</span>
      <Link className={styles.footerCredit} href={author ? '/' : '/sssvam/'}>{author ? 'Балаково Go' : 'сделано sssvam'} <span aria-hidden="true">↗</span></Link>
    </div>
  </footer>;
}

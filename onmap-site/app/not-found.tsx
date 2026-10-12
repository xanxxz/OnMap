import Link from 'next/link';
import styles from './site.module.css';

export default function NotFound() {
  return <div className={styles.site}>
    <header className={styles.header}><Link className={styles.wordmark} href="/">balakovo-go.ru</Link><Link className={styles.headerLink} href="/onmap/">OnMap <span aria-hidden="true">↗</span></Link></header>
    <main id="main" className={styles.notFound}><p className={styles.kicker}>Ошибка 404</p><h1>Этой страницы нет.</h1><p>Проверьте адрес или вернитесь на главную.</p><Link className={styles.primaryLink} href="/">На главную <span aria-hidden="true">↗</span></Link></main>
  </div>;
}

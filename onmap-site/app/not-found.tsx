import Link from 'next/link';
import GoHeader from './components/GoHeader';
import GoFooter from './components/GoFooter';
import styles from './site.module.css';

export default function NotFound() {
  return <div className={styles.site}>
    <GoHeader />
    <main id="main" className={styles.notFound}><p>Ошибка 404</p><h1>Страница не найдена.</h1><Link className={styles.primaryLink} href="/">На главную ↗</Link></main>
    <GoFooter />
  </div>;
}

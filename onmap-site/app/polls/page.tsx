import type { Metadata } from 'next';
import Link from 'next/link';
import GoHeader from '../components/GoHeader';
import GoFooter from '../components/GoFooter';
import styles from './polls.module.css';

export const metadata: Metadata = {
  title: 'Опросы',
  description: 'Опросы о новых идеях для Балакова. Сейчас открытых голосований нет.',
};

export default function PollsPage() {
  return <div className={styles.page}>
    <GoHeader variant="polls" />
    <main id="main" className={styles.hero}>
      <div className={styles.intro}>
        <nav className={styles.breadcrumbs} aria-label="Навигационная цепочка">
          <Link href="/">Главная</Link><span aria-hidden="true">/</span><span aria-current="page">Опросы</span>
        </nav>
        <h1><span>Твой голос.</span><span><em>Следующий</em> шаг.</span></h1>
        <p>Выбираем, что сделать для города.</p>
      </div>

      <div className={styles.scene} aria-hidden="true" />

      <section className={styles.empty} aria-labelledby="polls-empty-title">
        <h2 id="polls-empty-title">Сейчас<br />без голосований</h2>
        <p>Важный вопрос появится здесь.</p>
        <Link href="/#projects">Посмотреть проекты <span aria-hidden="true">↗</span></Link>
      </section>

      <svg className={styles.wave} viewBox="0 0 1440 55" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 22C129-8 243 41 376 31C534 16 566 30 711 44C870 60 980 47 1104 49C1253 51 1329 31 1440 48V55H0Z" /></svg>
    </main>
    <GoFooter />
  </div>;
}

import type { Metadata } from 'next';
import Link from 'next/link';
import GoHeader from './components/GoHeader';
import GoFooter from './components/GoFooter';
import ProjectRail from './components/ProjectRail';
import styles from './site.module.css';

export const metadata: Metadata = {
  title: 'Балаково Go — есть идеи',
  description: 'Полезные цифровые проекты для Балаково. OnMap и новые идеи рядом.',
};

export default function Home() {
  return <div className={styles.site}>
    <GoHeader />
    <main id="main">
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroInner}>
          <h1 id="home-title"><span>Балаково<i>.</i></span><span>Есть идеи<i>.</i></span></h1>
          <p>Полезные штуки для своего города.</p>
          <a className={styles.textLink} href="#projects">Смотреть проекты <span aria-hidden="true">↘</span></a>
          <Link className={styles.madeBy} href="/sssvam/">сделано<br />sssvam</Link>
        </div>
      </section>

      <section className={styles.projects} id="projects" aria-labelledby="projects-title">
        <ProjectRail />
      </section>

      <section className={styles.pollBanner} aria-labelledby="poll-title">
        <div className={styles.pollBannerInner}>
          <h2 id="poll-title">Что дальше?</h2>
          <Link className={styles.pollLink} href="/polls/">Опросы скоро <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
    <GoFooter />
  </div>;
}

import Link from 'next/link';
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import { Shell } from './components/SiteShell';
import { EventExplorer } from './components/EventExplorer';
import { HowMarks } from './components/HowMarks';
import { AppPreview } from './components/AppPreview';
import styles from './experience.module.css';
export default function OnMapHome(){return <Shell><main id="main"><section className={styles.hero} id="map" aria-labelledby="onmap-title"><EventExplorer/><div className={styles.heroCopy}><p className={styles.kicker}>OnMap · карта событий</p><h1 id="onmap-title">Что<br/><span className={styles.titleLine}>на дороге<span className={styles.question}>?</span></span></h1><p className={styles.lead}>Метки от людей рядом с вами.</p><Link className={styles.cta} href="/onmap/download/">Скачать приложение<ArrowUpRight size={28} aria-hidden="true"/></Link></div></section><HowMarks/><AppPreview/></main></Shell>}

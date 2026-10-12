import Link from 'next/link';
import { Shell } from './SiteShell';
import styles from '../content.module.css';

export { styles as contentStyles };

export function DocumentPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return <Shell><main id="main" className={styles.content}><Link className={styles.back} href="/onmap/">← К OnMap</Link><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p className={styles.intro}>{intro}</p>{children}</main></Shell>;
}

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import Link from 'next/link';
import { Shell } from './SiteShell';
import styles from '../content.module.css';

export { styles as contentStyles };

const documents = [
  { title: 'Политика конфиденциальности', label: 'Конфиденциальность', shortLabel: 'Данные', href: '/onmap/privacy/' },
  { title: 'Условия использования', label: 'Условия', shortLabel: 'Условия', href: '/onmap/terms/' },
  { title: 'Правила сообщества', label: 'Правила сообщества', shortLabel: 'Правила', href: '/onmap/community-rules/' },
];

type ContentsItem = { id: string; title: string };

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return '';
  return Children.toArray(node.props.children).map(textOf).join('');
}

function withSectionAnchors(children: ReactNode, contents: ContentsItem[]): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode; id?: string }>(child)) return child;
    const element = child as ReactElement<{ children?: ReactNode; id?: string }>;
    if (element.type === 'h2') {
      const id = element.props.id || `section-${contents.length + 1}`;
      contents.push({ id, title: textOf(element) });
      return cloneElement(element, { id });
    }
    if (element.props.children === undefined) return element;
    return cloneElement(element, { children: withSectionAnchors(element.props.children, contents) });
  });
}

function DocumentLinks({ title, compact = false }: { title: string; compact?: boolean }) {
  return <nav className={compact ? styles.documentTabs : styles.documentLinks} aria-label="Документы OnMap">
    {documents.map((document) => <Link key={document.href} href={document.href} aria-current={title === document.title ? 'page' : undefined}>
      {compact ? document.shortLabel : document.label}
    </Link>)}
  </nav>;
}

function Contents({ items, mobile = false }: { items: ContentsItem[]; mobile?: boolean }) {
  if (!items.length) return null;
  return <nav className={mobile ? styles.mobileContents : styles.contents} aria-label="На этой странице">
    <p>На этой странице</p>
    <ol>{items.map((item) => <li key={item.id}><a href={`#${item.id}`}><span>{item.title}</span><span aria-hidden="true">↗</span></a></li>)}</ol>
  </nav>;
}

export function DocumentPage({ eyebrow, title, intro, revision, children }: { eyebrow: string; title: string; intro: string; revision?: string; children: ReactNode }) {
  const contents: ContentsItem[] = [];
  const body = withSectionAnchors(children, contents);
  const index = documents.findIndex((document) => document.title === title);

  return <Shell compact><main id="main" className={`${styles.content} ${styles.documentPage}`}>
    <div className={styles.documentLayout}>
      <aside className={styles.sidebar}>
        <p className={styles.sidebarLabel}>Документы</p>
        <DocumentLinks title={title} />
        <Contents items={contents} />
      </aside>
      <article className={styles.documentArticle}>
        <header className={styles.documentHeading} id="document-top">
          <div className={styles.headingMeta}><p className={styles.eyebrow}>{eyebrow}</p>{index >= 0 && <span className={styles.documentNumber}>{String(index + 1).padStart(2, '0')} / 03</span>}</div>
          <h1>{title}</h1>
          <DocumentLinks title={title} compact />
          {revision && <p className={styles.revision}>Редакция от {revision}</p>}
          <p className={styles.intro}>{intro}</p>
        </header>
        <Contents items={contents} mobile />
        {body}
        <div className={styles.documentEnd}><Link href="/onmap/support/">Поддержка OnMap <span aria-hidden="true">↗</span></Link><a className={styles.backTop} href="#document-top" aria-label="В начало документа"><span aria-hidden="true">↑</span></a></div>
      </article>
    </div>
  </main></Shell>;
}

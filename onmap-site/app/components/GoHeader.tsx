'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import styles from './go-shell.module.css';

type HeaderVariant = 'home' | 'polls' | 'author';

const siteLinks = [
  { href: '/#projects', label: 'Проекты' },
  { href: '/polls/', label: 'Опросы' },
  { href: '/sssvam/', label: 'sssvam', external: true },
];

const authorLinks = [
  { href: '#work', label: 'Работы' },
  { href: '#about', label: 'Обо мне' },
];

export default function GoHeader({ variant = 'home' }: { variant?: HeaderVariant }) {
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const author = variant === 'author';
  const navLinks = author ? authorLinks : siteLinks;

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        // Different enter and exit points keep the shell steady near the threshold.
        setCompact(current => current ? scrollY > 160 : scrollY > 240);
        if (!author && window.innerWidth > 760 && scrollY <= 160) setMenuOpen(false);
        frame = 0;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [author]);

  useEffect(() => {
    const onResize = () => {
      if (!author && window.innerWidth > 760 && !compact) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [author, compact]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!barRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  return <>
    <a className={styles.skip} href="#main">К содержанию</a>
    <header className={styles.header} data-variant={variant} data-compact={compact} data-author={author} data-menu-open={menuOpen}>
      <div ref={barRef} className={styles.bar}>
        {author && <Link className={styles.authorBack} href="/" aria-label="На главную Балаково Go" onClick={() => setMenuOpen(false)}>←</Link>}
        <Link className={styles.brand} href={author ? '/sssvam/' : '/'} aria-label={author ? 'sssvam — начало страницы' : 'Балаково Go — главная'} onClick={() => setMenuOpen(false)}>
          <Image className={styles.brandFull} src={author ? '/brand/sssvam-logo.svg' : '/brand/bgo-logo.svg'} alt="" width={author ? 208 : 267} height={author ? 44 : 48} priority />
          <Image className={styles.brandCompact} src={author ? '/brand/sssvam-mark-light.svg' : '/brand/bgo-mark-light.svg'} alt="" width={64} height={64} />
        </Link>
        <nav className={styles.desktopNav} aria-label={author ? 'Навигация автора' : 'Основная навигация'}>
          {navLinks.map(item => <Link key={item.href} href={item.href} aria-current={variant === 'polls' && item.href === '/polls/' ? 'page' : undefined} className={variant === 'polls' && item.href === '/polls/' ? styles.active : ''} onClick={() => setMenuOpen(false)}>{item.label}{'external' in item && <span aria-hidden="true"> ↗</span>}</Link>)}
        </nav>
        <button ref={menuButtonRef} className={styles.menuButton} type="button" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} aria-controls="go-menu" onClick={() => setMenuOpen(value => !value)}>
          <span className={styles.menuIcon} aria-hidden="true"><span /><span /><span /></span>
        </button>
      </div>
      <nav ref={menuRef} id="go-menu" className={styles.menu} aria-label="Меню сайта" hidden={!menuOpen}>
        <Link className={styles.menuBrand} href={author ? '/sssvam/' : '/'} aria-label={author ? 'sssvam — начало страницы' : 'Балаково Go — главная'} onClick={() => setMenuOpen(false)}>
          <Image className={styles.menuBrandMark} src={author ? '/brand/sssvam-mark-light.svg' : '/brand/bgo-mark-light.svg'} alt="" width={64} height={64} />
          <Image className={styles.menuBrandWord} src={author ? '/brand/sssvam-logo-light.svg' : '/brand/bgo-wordmark-light.svg'} alt="" width={author ? 208 : 205} height={author ? 44 : 48} />
        </Link>
        {author && <><Link href="#work" onClick={() => setMenuOpen(false)}>Работы</Link><Link href="#about" onClick={() => setMenuOpen(false)}>Обо мне</Link></>}
        <Link href="/" onClick={() => setMenuOpen(false)}>Главная</Link>
        <Link href="/#projects" onClick={() => setMenuOpen(false)}>Проекты</Link>
        <Link href="/polls/" onClick={() => setMenuOpen(false)}>Опросы</Link>
        <Link href="/sssvam/" onClick={() => setMenuOpen(false)}>sssvam <span aria-hidden="true">↗</span></Link>
      </nav>
    </header>
  </>;
}

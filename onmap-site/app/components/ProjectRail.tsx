'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import OnMapArtwork from './OnMapArtwork';
import styles from '../site.module.css';

const projects = [
  {
    title: 'OnMap',
    description: 'Дорожные события рядом',
    href: '/onmap/',
    kind: 'onmap',
  },
  {
    title: 'Балаково Go',
    description: 'Проекты для своего города',
    href: '/sssvam/#balakovo-go',
    kind: 'bgo',
    image: '/art/balakovo-go-device-cutout.png',
  },
] as const;

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={direction === 'left' ? 'm14.5 5-7 7 7 7' : 'm9.5 5 7 7-7 7'} />
  </svg>;
}

function Arrow() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 19 19 5M9 5h10v10" /></svg>;
}

export default function ProjectRail() {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const change = (direction: number) => setIndex(current => (current + direction + projects.length) % projects.length);

  return <>
    <div className={styles.projectsHeader}>
      <h2 id="projects-title">Сделано рядом</h2>
      <div className={styles.carouselControls} aria-label="Листать проекты">
        <button type="button" onClick={() => change(-1)} aria-label="Предыдущий проект"><Chevron direction="left" /></button>
        <button type="button" onClick={() => change(1)} aria-label="Следующий проект"><Chevron direction="right" /></button>
      </div>
    </div>
    <div className={styles.projectsGrid}>
      <div
        className={styles.featured}
        onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={event => {
          if (touchStart.current === null) return;
          const distance = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
          touchStart.current = null;
          if (Math.abs(distance) < 45) return;
          suppressClick.current = true;
          change(distance < 0 ? 1 : -1);
          window.setTimeout(() => { suppressClick.current = false; }, 360);
        }}
      >
        {projects.map((project, slideIndex) => <Link
          key={project.href}
          className={styles.featuredSlide}
          data-project={slideIndex}
          data-active={slideIndex === index}
          href={project.href}
          aria-label={`Открыть ${project.title}`}
          aria-hidden={slideIndex !== index}
          tabIndex={slideIndex === index ? 0 : -1}
          onClick={event => { if (suppressClick.current) event.preventDefault(); }}
        >
          <div className={styles.featuredStage} aria-hidden="true">
            {project.kind === 'onmap'
              ? <OnMapArtwork sizes="(max-width: 700px) 100vw, 65vw" priority />
              : <div className={styles.stageClip}><Image src={project.image} alt="" fill sizes="(max-width: 700px) 100vw, 60vw" /></div>}
          </div>
          <div className={styles.featuredCopy}>
            <h3>{project.title}</h3>
            <p>{project.description}</p>
            <span className={styles.cardLink}>Открыть <Arrow /></span>
          </div>
        </Link>)}
      </div>
      <Link className={styles.nextIdea} href="/polls/" aria-label="Посмотреть опросы">
        <span className={styles.nextIdeaArt} aria-hidden="true" />
        <h3>Следующая<br />идея?</h3>
        <span className={styles.ideaLink}>Посмотреть<br />опросы <Arrow /></span>
      </Link>
    </div>
  </>;
}

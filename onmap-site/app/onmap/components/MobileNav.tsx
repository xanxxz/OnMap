'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, List, X } from '@phosphor-icons/react';
import styles from '../onmap.module.css';
const links=[{href:'/onmap/#map',label:'Карта'},{href:'/onmap/#how-it-works',label:'Как работает'},{href:'/onmap/download/',label:'Скачать приложение'},{href:'/onmap/support/',label:'Поддержка'},{href:'/onmap/privacy/',label:'Документы'}];
export function MobileNav(){const[open,setOpen]=useState(false);const ref=useRef<HTMLButtonElement>(null);return <div className={styles.mobileNav}><button className={styles.menuButton} ref={ref} type="button" aria-label={open?'Закрыть меню':'Открыть меню'} aria-expanded={open} aria-controls="onmap-mobile-menu" onClick={()=>setOpen(v=>!v)}>{open?<X size={32}/>:<List size={34}/>}</button><nav className={styles.mobileMenu} id="onmap-mobile-menu" aria-label="Мобильная навигация OnMap" hidden={!open} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);ref.current?.focus()}}}>{links.map(link=><Link key={link.href} href={link.href} onClick={()=>setOpen(false)}>{link.label}<ArrowUpRight size={19} aria-hidden="true"/></Link>)}<Link className={styles.mobileHomeLink} href="/" onClick={()=>setOpen(false)}>На balakovo-go.ru<ArrowUpRight size={19} aria-hidden="true"/></Link></nav></div>}

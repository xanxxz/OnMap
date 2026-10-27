'use client';
import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import styles from '../experience.module.css';

const events=[
 {type:'ACCIDENT',label:'ДТП',color:'coral',x:39.1,y:54.2,primary:true},
 {type:'ROADWORKS',label:'Работы',color:'lime',x:67.7,y:45.4,primary:true},
 {type:'ROAD_PATROL',label:'ДПС',color:'blue',x:52,y:70,primary:true},
 {type:'TRAFFIC',label:'Затор',color:'coral',x:61,y:61,primary:false},
 {type:'ROAD_CLOSURE',label:'Перекрытие',color:'lime',x:65,y:42,primary:false},
 {type:'ROAD_HAZARD',label:'Опасность',color:'lime',x:34,y:69,primary:false},
 {type:'TRAFFIC_LIGHT',label:'Светофор',color:'lime',x:52,y:36,primary:false},
 {type:'ROAD_SERVICE',label:'Служба',color:'blue',x:85,y:48,primary:false},
 {type:'OTHER',label:'Другое',color:'blue',x:48,y:79,primary:false},
] as const;
export function EventExplorer(){const[selected,setSelected]=useState<string>('ACCIDENT');return <div className={styles.explorer}>
 <div className={styles.map} aria-label="Иллюстрация дорожных событий на условной карте">
  <div className={styles.mapPlane}>
  <Image className={styles.mapArt} src="/art/onmap/city-map.webp" alt="Иллюстрированный городской квартал с улицами и каналом" fill sizes="(max-width: 700px) 100vw, 80vw" priority/>
  <div className={styles.mapPins}>{events.map(event=><div key={event.type} className={styles.pinAnchor} style={{'--x':`${event.x}%`,'--y':`${event.y}%`} as CSSProperties} data-color={event.color} data-active={selected===event.type} data-primary={event.primary}>
    <span className={styles.pinLabel} aria-hidden="true">{event.label}</span>
    <button className={styles.pin} type="button" aria-label={`Показать: ${event.label}`} aria-pressed={selected===event.type} tabIndex={event.primary||selected===event.type?0:-1} onClick={()=>setSelected(event.type)}><Image src={`/markers/${event.type}.png`} alt="" width={70} height={70}/></button>
  </div>)}</div>
  </div>
 </div>
 <div className={styles.eventPicker}><div className={styles.eventList} role="group" aria-label="Типы дорожных событий">{events.map(event=><button key={event.type} type="button" data-color={event.color} aria-pressed={selected===event.type} onClick={()=>setSelected(event.type)}><Image src={`/markers/${event.type}.png`} alt="" width={44} height={44}/><span>{event.label}</span></button>)}</div></div>
 <p className={styles.mapNote}>Пример, не оперативная карта</p>
 </div>}

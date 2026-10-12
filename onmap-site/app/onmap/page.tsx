import Image from 'next/image';
import Link from 'next/link';
import { Shell } from './components/SiteShell';
import { androidApkUrl, appStoreUrl } from './links';
import styles from './onmap.module.css';

const mapMarkers = [
  { type: 'ACCIDENT', label: 'ДТП', position: 'markerOne' },
  { type: 'ROADWORKS', label: 'Дорожные работы', position: 'markerTwo' },
  { type: 'TRAFFIC', label: 'Трафик', position: 'markerThree' },
  { type: 'ROAD_HAZARD', label: 'Опасность', position: 'markerFour' },
  { type: 'TRAFFIC_LIGHT', label: 'Светофор', position: 'markerFive' },
  { type: 'ROAD_SERVICE', label: 'Дорожная служба', position: 'markerSix' },
];
const otherEvents = [
  ['ROAD_CLOSURE', 'Перекрытия'], ['ROAD_PATROL', 'ДПС'], ['OTHER', 'Другое'],
];

function DownloadActions() {
  return <div className={styles.actions}>
    {androidApkUrl ? <a className={styles.primaryButton} href={androidApkUrl}>Скачать для Android <span aria-hidden="true">↗</span></a> : <span className={styles.disabledButton} aria-disabled="true">Android — скоро</span>}
    {appStoreUrl ? <a className={styles.secondaryButton} href={appStoreUrl}>App Store <span aria-hidden="true">↗</span></a> : <span className={styles.disabledButton} aria-disabled="true">App Store — скоро</span>}
  </div>;
}

export default function OnMapHome() {
  return <Shell><main id="main">
    <section className={styles.hero} aria-labelledby="onmap-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>OnMap / карта дорожных событий</p>
        <h1 id="onmap-title">Замечать важное<br/><span>по пути.</span></h1>
        <p className={styles.heroLead}>OnMap показывает дорожные события на карте. Люди добавляют отметки и помогают понять, остаются ли они актуальными.</p>
        <DownloadActions />
        <Link className={styles.smallLink} href="/onmap/download/">Как установить приложение <span aria-hidden="true">↗</span></Link>
      </div>
      <div className={styles.heroSide}><span className={styles.heroRule} /><p>На карте можно увидеть<br/>то, о чём сообщают рядом.</p><span className={styles.heroCount}>01 / 03</span></div>
    </section>

    <section className={styles.mapSection} id="map" aria-labelledby="map-title">
      <div className={styles.mapHeading}><div><p className={styles.eyebrow}>Что видно на карте</p><h2 id="map-title">Дорожная обстановка<br/>в отметках</h2></div><p>ДТП, работы, перекрытия и другие события появляются там, где их отметили. Эта схема показывает типы меток OnMap и не изображает реальную обстановку.</p></div>
      <div className={styles.mapScene}>
        <Image className={styles.mapBase} src="/map-atlas.svg" alt="Иллюстрация улиц и реки" fill sizes="100vw" />
        <div className={styles.mapStamp}>Иллюстрация карты <span>· маркеры OnMap</span></div>
        {mapMarkers.map(marker => <div className={`${styles.mapMarker} ${styles[marker.position]}`} key={marker.type}><Image src={`/markers/${marker.type}.png`} alt={marker.label} width={70} height={70} /></div>)}
        <div className={styles.mapLegend}><span className={styles.legendDot} />Отметки от сообщества и других источников</div>
      </div>
      <div className={styles.eventStrip} aria-label="Другие типы событий"><span>Также на карте</span>{otherEvents.map(([type, label]) => <span className={styles.eventItem} key={type}><Image src={`/markers/${type}.png`} alt="" width={34} height={34} />{label}</span>)}</div>
    </section>

    <section className={styles.community} id="community" aria-labelledby="community-title">
      <div className={styles.communityLabel}><span>02 / Как это работает</span><span className={styles.communityLine} /></div>
      <div className={styles.communityBody}><h2 id="community-title">Карта меняется<br/>вместе с дорогой.</h2><div><p>Вы можете добавить событие, выбрав его тип и место на карте. Другие пользователи могут подтвердить отметку или сообщить, что ситуация изменилась.</p><p>Такие реакции помогают ориентироваться, но не доказывают, что событие проверено.</p><Link className={styles.textLink} href="/onmap/community-rules/">Правила сообщества <span aria-hidden="true">↗</span></Link></div></div>
    </section>

    <section className={styles.safety} aria-label="Внимание за рулём"><span className={styles.safetySymbol}>!</span><p><strong>Сначала дорога.</strong> Не отвлекайтесь на экран за рулём. Данные OnMap могут быть неполными или ошибочными. Ориентируйтесь на знаки и официальные указания.</p></section>

    <section className={styles.download} aria-labelledby="download-title"><div><p className={styles.eyebrow}>03 / Установка</p><h2 id="download-title">Возьмите карту<br/>с собой.</h2><p>Ссылки на приложение появятся здесь после публикации сборок.</p></div><div><DownloadActions /><Link className={styles.smallLink} href="/onmap/download/">Подробнее об установке <span aria-hidden="true">↗</span></Link></div></section>
  </main></Shell>;
}

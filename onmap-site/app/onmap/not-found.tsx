import Link from 'next/link';
import { Shell } from './components/SiteShell';
import s from './content.module.css';

export default function OnMapNotFound() {
  return <Shell><main id="main" className={s.content}><p className={s.eyebrow}>Ошибка 404</p><h1>В разделе OnMap такой страницы нет.</h1><p className={s.intro}>Проверьте адрес или вернитесь к приложению.</p><Link className={s.action} href="/onmap/">На главную OnMap →</Link></main></Shell>;
}

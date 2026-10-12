import type { Metadata } from 'next';
import { DocumentPage, contentStyles as s } from '../components/DocumentPage';

export const metadata: Metadata = { title: 'Поддержка', description: 'Связь с поддержкой OnMap в Telegram.' };

export default function Support() {
  return <DocumentPage eyebrow="Связь" title="Поддержка" intro="Если что-то не работает или вы заметили проблему с отметкой, напишите нам в Telegram.">
    <a className={s.supportLink} href="https://t.me/onMapSupport">@onMapSupport <span aria-hidden="true">↗</span></a>
    <p className={s.muted}>Откроется Telegram. Напишите и отправьте сообщение самостоятельно — переход по ссылке ничего не отправляет.</p>
    <section className={s.section}><h2>Когда ждать ответ</h2><div><p>Обычные обращения, которые доставлены в поддержку, рассматриваются не позднее трёх рабочих дней. Для срочных сообщений отдельный срок не установлен.</p></div></section>
    <div className={s.callout}><strong>Нужна срочная помощь?</strong> Обратитесь в соответствующую экстренную службу. Поддержка OnMap не предназначена для вызова помощи.</div>
  </DocumentPage>;
}

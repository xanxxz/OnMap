import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, CaretDown, ChatCircleDots, Clock } from '@phosphor-icons/react/dist/ssr';
import { Shell } from '../components/SiteShell';
import s from '../utility.module.css';

export const metadata: Metadata = { title: 'Поддержка', description: 'Связь с поддержкой OnMap в Telegram: исправление событий, вопросы о приложении и данных.' };

export default function Support() {
  return <Shell compact>
    <main id="main" className={`${s.page} ${s.supportPage}`}>
      <div className={s.supportLayout}>
        <div className={s.supportIntro}>
          <h1 className={s.supportTitle}>Нужна <br />помощь?</h1>
          <p className={s.lead}>С меткой, приложением или данными — напишите нам.</p>
          <div className={s.contactPanel}>
            <a className={s.contactName} href="https://t.me/onMapSupport"><ChatCircleDots size={52} aria-hidden="true" /><span>@onMapSupport</span><ArrowUpRight size={33} aria-hidden="true" /></a>
            <a className={s.primaryAction} href="https://t.me/onMapSupport">Написать в поддержку <ArrowRight size={29} aria-hidden="true" /></a>
          </div>
        </div>

        <div className={s.supportTopics}>
          <details className={s.supportDisclosure}>
            <summary><span className={s.topicNumber}>01</span><span><strong>Исправить метку</strong><span className={s.topicDescription}>Укажите ID события и что нужно изменить.</span></span><CaretDown className={s.disclosureChevron} size={25} aria-hidden="true" /></summary>
            <div className={s.topicContent}><p>Укажите ID события и что нужно исправить, скрыть или удалить. Оператор рассмотрит запрос вручную. Не отправляйте лишние личные сведения.</p></div>
          </details>
          <details className={s.supportDisclosure}>
            <summary><span className={s.topicNumber}>02</span><span><strong>Сообщить об ошибке</strong><span className={s.topicDescription}>Опишите проблему и устройство.</span></span><CaretDown className={s.disclosureChevron} size={25} aria-hidden="true" /></summary>
            <div className={s.topicContent}><p>Расскажите, что произошло и как повторить ошибку. Укажите модель устройства и версию приложения. Если нужен скриншот, проверьте, что на нём нет лишних личных сведений.</p></div>
          </details>
          <details className={s.supportDisclosure}>
            <summary><span className={s.topicNumber}>03</span><span><strong>Пожаловаться на отметку</strong><span className={s.topicDescription}>Откройте событие в приложении.</span></span><CaretDown className={s.disclosureChevron} size={25} aria-hidden="true" /></summary>
            <div className={s.topicContent}><p>Выберите «Пожаловаться». После десяти жалоб с разных идентификаторов отметка скрывается до ручного решения владельца.</p></div>
          </details>
          <div className={s.responseTime}><span className={s.topicNumber}><Clock size={30} aria-hidden="true" /></span><p>Обычные обращения рассматриваются в срок до трёх дней.</p></div>
        </div>
      </div>

      <div className={s.supportBottom}><p>Оператор — Дейнега Даниил Александрович.</p><p>При непосредственной опасности обращайтесь в экстренную службу.</p></div>
      <Link className={s.returnLink} href="/onmap/"><ArrowLeft size={27} aria-hidden="true" />На главную OnMap</Link>
    </main>
  </Shell>;
}

import type { Metadata } from 'next';
import { DocumentPage, contentStyles as s } from '../components/DocumentPage';

export const metadata: Metadata = { title: 'Правила сообщества', description: 'Как делиться дорожными событиями в OnMap.' };

export default function Rules() {
  return <DocumentPage eyebrow="Сообщество" title="Правила сообщества" intro="Отметки полезны, когда люди добавляют их внимательно и относятся друг к другу с уважением.">
    <p className={s.status}>Подробные правила будут размещены здесь после утверждения. Пока ориентируйтесь на эти основные принципы.</p>
    <section className={s.section}><h2>Добавляйте по делу</h2><div><p>Выберите подходящий тип и точку на карте. Не создавайте ложные события, дубликаты или отметки ради причинения вреда.</p></div></section>
    <section className={s.section}><h2>Берегите чужую приватность</h2><div><p>Не используйте отметки для угроз, преследования или распространения личных сведений. Если заметили такие сведения в карточке события, сообщите об этом поддержке.</p></div></section>
    <section className={s.section}><h2>Оценивайте осторожно</h2><div><p>Подтверждение, число реакций и статус отметки не гарантируют, что событие проверено. Сверяйтесь с дорожными знаками и официальными указаниями.</p></div></section>
    <section className={s.section}><h2>Сообщить о проблеме</h2><div><p>Напишите в <a href="https://t.me/onMapSupport">@onMapSupport</a>. Сообщение нужно отправить вручную. Обращение не означает, что отметка будет автоматически скрыта.</p></div></section>
  </DocumentPage>;
}

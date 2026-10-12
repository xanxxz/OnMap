import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'OnMap — дорожные события на карте', template: '%s · OnMap' },
  description: 'OnMap показывает дорожные события на карте. Пользователи добавляют отметки и помогают уточнять их актуальность.',
  icons: { icon: '/app-icon.png', apple: '/app-icon.png' },
  openGraph: {
    title: 'OnMap — дорожные события на карте',
    description: 'Карта дорожных событий с отметками сообщества.',
    url: 'https://balakovo-go.ru/onmap/',
    siteName: 'OnMap',
    locale: 'ru_RU',
    type: 'website',
    images: ['/app-icon.png'],
  },
};

export default function OnMapLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

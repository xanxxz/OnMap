import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'OnMap — дорожные события на карте', template: '%s · OnMap' },
  description: 'OnMap показывает дорожные события на карте. Пользователи добавляют отметки и помогают уточнять их актуальность.',
  icons: { icon: '/onmap-icon.svg', apple: '/app-icon.png' },
  openGraph: {
    title: 'OnMap — дорожные события на карте',
    description: 'Карта дорожных событий с отметками сообщества.',
    url: 'https://balakovo-go.ru/onmap/',
    siteName: 'OnMap',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: '/brand/og-onmap.png', width: 1200, height: 630, alt: 'OnMap — карта дорожных событий' }],
  },
};

export default function OnMapLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

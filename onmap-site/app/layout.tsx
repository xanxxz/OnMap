import type { Metadata } from 'next';
import '@fontsource-variable/golos-text/wght.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://balakovo-go.ru'),
  title: { default: 'balakovo-go.ru — проекты сайта', template: '%s · balakovo-go.ru' },
  description: 'Главная страница balakovo-go.ru. Переход к проекту OnMap.',
  icons: { icon: '/brand/bgo-favicon-v2.svg', apple: '/brand/bgo-apple-touch.png' },
  openGraph: {
    title: 'balakovo-go.ru',
    description: 'Главная страница сайта и доступные проекты.',
    url: 'https://balakovo-go.ru/',
    siteName: 'balakovo-go.ru',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: '/brand/og-bgo.png', width: 1200, height: 630, alt: 'balakovo-go.ru — сайт проектов в Балакове' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}

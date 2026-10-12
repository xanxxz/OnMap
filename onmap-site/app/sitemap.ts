import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';
const paths = ['', 'onmap/', 'onmap/download/', 'onmap/privacy/', 'onmap/terms/', 'onmap/community-rules/', 'onmap/support/'];
export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map(path => ({ url: `https://balakovo-go.ru/${path}` }));
}

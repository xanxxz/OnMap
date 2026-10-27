import Image from 'next/image';
import styles from './onmap-artwork.module.css';

type Props = {
  className?: string;
  sizes?: string;
  priority?: boolean;
  alt?: string;
};

export default function OnMapArtwork({
  className = '',
  sizes = '(max-width: 700px) 100vw, 55vw',
  priority = false,
  alt = 'Телефон с картой дорожных событий OnMap',
}: Props) {
  return <div className={`${styles.scene} ${className}`} role="img" aria-label={alt}>
    <div className={styles.stageMask} data-onmap-stage aria-hidden="true">
      <Image src="/art/onmap-stage.webp" alt="" fill sizes={sizes} priority={priority} />
    </div>
    <Image className={styles.contactShadow} data-onmap-shadow src="/art/onmap-contact-shadow.svg" alt="" fill sizes={sizes} priority={priority} aria-hidden="true" />
    <div className={styles.phoneGroup} data-onmap-phone aria-hidden="true">
      <Image className={styles.screenLayer} src="/art/onmap-screen-fitted.png?v=aligned-3" alt="" fill sizes={sizes} priority={priority} />
      <Image src="/art/onmap-device.webp" alt="" fill sizes={sizes} priority={priority} />
    </div>
  </div>;
}

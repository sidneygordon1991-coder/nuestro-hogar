import BrandMark from './BrandMark';

/** Branded loading screen for app start and session checks: the mark, the name and a quiet progress line. */
export default function BootScreen({label = 'Cargando Nuestro Hogar'}: {label?: string}) {
  return (
    <div className="nh-boot" role="status" aria-label={label}>
      <span className="nh-boot-mark" aria-hidden="true">
        <BrandMark size={40} />
      </span>
      <strong className="nh-boot-name" aria-hidden="true">
        Nuestro Hogar
      </strong>
      <span className="nh-boot-line" aria-hidden="true">
        <i />
      </span>
    </div>
  );
}

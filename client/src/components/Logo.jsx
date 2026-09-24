// The EChargeFind mark: a map pin ("find") with a lightning bolt ("charge") through it.
// tone="light" (for light backgrounds): green pin, lime bolt. tone="dark" (on the dark green
// panel): lime pin, dark bolt. public/favicon.svg is the same drawing. Decorative: the brand name
// next to it is the accessible text.
const PIN_PATH =
  'M16 1.5C9.1 1.5 3.5 6.9 3.5 13.7c0 8.6 10.5 16.9 11.6 17.7.5.4 1.3.4 1.8 0 1.1-.8 11.6-9.1 11.6-17.7C28.5 6.9 22.9 1.5 16 1.5Z';
const BOLT_PATH = 'M17.6 5.6 10 15.6h5l-1.4 8 7.6-10h-5l1.4-8Z';

const TONES = {
  light: { pin: '#0A7A45', bolt: '#D4FF3D' },
  dark: { pin: '#D4FF3D', bolt: '#0C2418' },
};

export default function Logo({ size = 32, tone = 'light', className = '' }) {
  const colors = TONES[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <path d={PIN_PATH} fill={colors.pin} />
      <path d={BOLT_PATH} fill={colors.bolt} />
    </svg>
  );
}

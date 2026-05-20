import logoPng from '../../assets/logo.png';

interface AppIconProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A highly-polished, responsive logo component for VibePrompter.
 *
 * Renders the brand-consistent, high-fidelity transparent logo.png asset
 * at precise dimensions across all application surfaces.
 */
const SIZE_PX: Record<NonNullable<AppIconProps['size']>, number> = {
  sm: 18,
  md: 22,
  lg: 28,
  xl: 42,
};

export function AppIcon({ size = 'md', className = '', style }: AppIconProps) {
  const px = SIZE_PX[size];
  
  return (
    <img
      src={logoPng}
      width={px}
      height={px}
      alt="VibePrompter"
      className={`select-none pointer-events-none object-contain ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style,
      }}
    />
  );
}

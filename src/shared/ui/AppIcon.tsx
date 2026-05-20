import { isWindowsTauri } from '@shared/lib';
import logoUrl from '@/assets/logo.png';

interface AppIconProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: React.CSSProperties;
}

export function AppIcon({ size = 'md', className = '', style }: AppIconProps) {
  const isWindows = isWindowsTauri();

  if (isWindows) {
    const sizeMap = {
      sm: 'w-[18px] h-[18px] rounded-[5px]',
      md: 'w-[22px] h-[22px] rounded-[6px]',
      lg: 'w-[28px] h-[28px] rounded-[7px]',
      xl: 'w-[40px] h-[40px] rounded-[10px]',
    };

    return (
      <img
        src={logoUrl}
        className={`object-cover select-none pointer-events-none ${sizeMap[size]} ${className}`}
        style={style}
        alt="VibePrompter"
      />
    );
  }

  // Fallback to the original css-based logo
  return (
    <span
      className={`ph-mark ${size} ${className}`}
      style={style}
    />
  );
}

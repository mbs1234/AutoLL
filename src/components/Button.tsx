import { use } from 'react';

import NavContext, { NavError } from '@/contexts/NavContext';
import ThemeContext from '@/contexts/ThemeContext';

const TYPES = {
  normal: 'py-0.75',
  small: 'py-1.25 text-xs uppercase tracking-wide',
  full: 'w-full py-2.75',
};

export default function Button<P>(
  props: Omit<React.HTMLProps<HTMLButtonElement>, 'type' | 'onClick'> & {
    onClick?: () => void | Promise<void>;
    type?: keyof typeof TYPES;
    back?: boolean | { screen?: React.FC<P>; props?: Partial<P> };
    color?: string;
    border?: string;
  }
) {
  const { goBack } = use(NavContext);
  const { type, back, onClick, className, color, border, ...attrs } = props;
  const cls = `${TYPES[type || 'normal']} ${className || ''} ${color ?? `${use(ThemeContext).bg} text-white`} ${border ?? 'border border-black/20 rounded-lg'}`;
  return (
    <button
      onClick={async event => {
        event.stopPropagation();
        if (back) {
          try {
            await goBack(back === true ? undefined : back);
          } catch (error) {
            if (!(error instanceof NavError)) throw error;
          }
        }
        if (onClick) await onClick();
      }}
      className={`${cls} inline-flex items-center justify-center min-w-9 px-1.75 font-semibold disabled:opacity-50`}
      {...attrs}
    />
  );
}

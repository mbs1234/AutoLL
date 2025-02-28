import { use } from 'react';

import NavContext, { NavError } from '@/contexts/NavContext';
import ThemeContext from '@/contexts/ThemeContext';

const TYPES = {
  normal: 'py-1',
  small: 'py-1.5 text-xs uppercase tracking-wide',
  full: 'w-full py-3',
};

export default function Button<P>(
  props: Omit<React.HTMLProps<HTMLButtonElement>, 'type' | 'onClick'> & {
    onClick?: () => void | Promise<void>;
    type?: keyof typeof TYPES;
    back?: boolean | { screen?: React.FC<P>; props?: Partial<P> };
  }
) {
  const { goBack } = use(NavContext);
  const { type, back, onClick, className, ...attrs } = props;
  let cls = `${TYPES[type || 'normal']} ${className || ''}`;
  if (!cls.includes(' bg-')) cls += ` ${use(ThemeContext).bg} text-white`;
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
      className={`${cls} inline-flex items-center justify-center min-w-[36px] rounded-lg px-2 font-semibold disabled:opacity-50`}
      {...attrs}
    />
  );
}

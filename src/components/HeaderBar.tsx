import { Children, Fragment, isValidElement, use } from 'react';

import ThemeContext from '@/contexts/ThemeContext';
import useScreenState from '@/hooks/useScreenState';
import BackIcon from '@/icons/BackIcon';

import Button from './Button';

export default function HeaderBar({
  title,
  buttons,
  subhead,
}: {
  title: React.ReactNode;
  buttons?: React.ReactNode;
  subhead?: React.ReactNode;
}) {
  const { isFirstScreen } = useScreenState();
  const theme = use(ThemeContext);

  function changeButtonColors(node: React.ReactNode): React.ReactNode {
    if (!isValidElement(node) || typeof node.type === 'string') return node;
    const n = node as React.JSX.Element;
    return n.type === Fragment ? (
      Children.map(n.props.children, changeButtonColors)
    ) : (
      <n.type
        {...n.props}
        className={`min-h-[36px] bg-white/90 ${theme.text} ${n.props.className || ''}`}
      />
    );
  }

  return (
    <div className={`px-3 ext-lg text-white ${theme.bg}`}>
      <div className="flex flex-wrap justify-end gap-x-2 gap-y-1 min-h-[36px] py-2">
        {!isFirstScreen && (
          <Button back className="-my-2 -ml-3" title="Go Back">
            <BackIcon />
          </Button>
        )}
        <h1 className="flex-1 self-center py-1 text-xl font-semibold overflow-hidden whitespace-nowrap">
          {title}
        </h1>
        {changeButtonColors(buttons)}
      </div>
      <div
        className={`empty:hidden flex flex-col gap-y-1 pb-1 ${theme.bg} text-white text-sm font-semibold uppercase text-center`}
      >
        {subhead}
      </div>
    </div>
  );
}

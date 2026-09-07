import { Children, Fragment, isValidElement, use } from 'react';

import { APP_NAME } from '@/appIdentity';
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
        color={`bg-white/90 ${theme.text}`}
        className={`min-h-9 ${n.props.className || ''}`}
      />
    );
  }

  return (
    <div className={`px-3 ext-lg text-white ${theme.bg}`}>
      <div className="flex flex-wrap justify-end gap-x-2 gap-y-1 min-h-9 py-2">
        {!isFirstScreen && (
          <Button back border="" className="-my-2 -ml-3" title="Go Back">
            <BackIcon />
          </Button>
        )}
        <h1 className="flex-1 self-center py-1 text-xl font-semibold overflow-hidden whitespace-nowrap">
          {title}
        </h1>
        {/* Which build this is, on every screen there is.
            `document.title` and the favicon answer the same question, but only
            where a tab strip exists: iOS Safari shows neither in normal
            browsing, and a page added to the Home Screen has no tab chrome at
            all -- which is exactly how this gets used. So the answer has to
            live inside the app.
            Beside the heading rather than inside it. Inside, it joins the
            heading's accessible name -- "Magic Kingdom AutoLL" to a screen
            reader, and to anything else that finds a screen by its title. */}
        <span
          aria-label={`Build: ${APP_NAME}`}
          className="self-center text-xs font-normal opacity-75 whitespace-nowrap"
        >
          {APP_NAME}
        </span>
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

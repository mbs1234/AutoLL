import MenuButton, { MenuButtonProps, MenuProps } from './MenuButton';

export default function Select<K extends string, V = K>(
  props: Omit<MenuButtonProps<K, V>, 'menuType'>
) {
  return <MenuButton {...props} menuType={SelectMenu} />;
}

export function SelectMenu<K extends string, V = K>(props: MenuProps<K, V>) {
  const { options, selected } = props;
  return (
    <ul className="dividers overflow-auto">
      {[...options].map(([k, opt]) => {
        return (
          <li key={opt.text}>
            <label className="flex items-center gap-x-2.5 px-4">
              <input
                type="radio"
                name="_SELECT_RADIO_BUTTON_"
                value={k}
                defaultChecked={k === selected}
                className="w-4 h-4 shrink-0"
              />{' '}
              {opt.icon && <span aria-hidden="true">{opt.icon}</span>}{' '}
              {opt.text}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

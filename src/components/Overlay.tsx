interface Props extends React.HTMLProps<HTMLDivElement> {
  color?: string;
}

export default function Overlay(props: Props) {
  const { children, color = 'bg-black/75', className = '', ...attrs } = props;
  return (
    <div
      className={`fixed inset-0 z-10 flex items-center justify-center p-2 ${color} ${className}`}
      {...attrs}
    >
      {children}
    </div>
  );
}

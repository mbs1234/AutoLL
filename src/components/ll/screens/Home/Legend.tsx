import Button from '@/components/Button';

export default function Legend({
  title,
  children,
  flex,
}: {
  title: string;
  children: React.ReactNode;
  flex?: string;
}) {
  return (
    <div className="flex justify-center mt-8">
      <div>
        <h2 className="mt-0 pl-1 text-gray-500 text-sm leading-tight uppercase">
          {title}
        </h2>
        <div className="border-2 border-gray-500 rounded-sm px-2 py-1 bg-gray-50">
          <table className={flex ? 'block' : ''}>
            <tbody className={flex ? `flex ${flex}` : ''}>{children}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Symbol({
  sym,
  def,
  onInfo,
}: {
  sym: React.ReactNode;
  def: React.ReactNode;
  onInfo?: () => void;
}) {
  return (
    <tr>
      <td className="text-center font-bold">{sym}</td>
      <td className="pl-3">{def}</td>
      {onInfo && (
        <td className="pl-3 py-0.5">
          <Button type="small" onClick={onInfo}>
            Info
          </Button>
        </td>
      )}
    </tr>
  );
}

interface WarningProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export default function Warning(props: WarningProps) {
  return (
    <div
      className={`mt-4 border-2 rounded-sm border-red-600 bg-red-100 ${props.className}`}
    >
      {props.title ? (
        <>
          <h3 className="mt-0 px-2 py-1 bg-red-600 text-red-50 text-sm font-semibold uppercase text-center">
            {props.title}
          </h3>
          <div className="px-2">{props.children}</div>
        </>
      ) : (
        <div className="px-2 py-1">{props.children}</div>
      )}
    </div>
  );
}

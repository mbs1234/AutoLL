interface AlertProps {
  children?: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
}

export default function Alert(props: AlertProps) {
  return (
    <div
      className={`mt-4 border-2 rounded-sm border-yellow-400 bg-yellow-100 ${props.className}`}
    >
      {props.title ? (
        <>
          <h3 className="mt-0 px-2 py-1 bg-yellow-400 text-black text-sm font-semibold uppercase text-center">
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

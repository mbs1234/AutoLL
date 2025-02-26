interface Land {
  name: string;
  park?: { name: string };
}

export default function LandLine({ land }: { land: Land }) {
  const park = land.park ?? land;
  if (!land.park) land = { name: '' };
  return (
    <div>
      {land.name && land.name !== 'Miscellaneous' && (
        <>
          {land.name}{' '}
          <span className="mx-0.5" aria-label="in">
            ⦁
          </span>{' '}
        </>
      )}
      {park.name}
    </div>
  );
}

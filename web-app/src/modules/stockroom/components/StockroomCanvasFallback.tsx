function StockroomCanvasFallback({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const background = tone === 'dark'
    ? 'from-slate-950 via-slate-900 to-[#355888]'
    : 'from-[#f8f7f2] via-white to-[#efece5]';

  return (
    <div className={`h-full min-h-[420px] w-full animate-pulse rounded-[28px] bg-gradient-to-br ${background}`} />
  );
}

export default StockroomCanvasFallback;

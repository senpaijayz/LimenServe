function StockroomCanvasFallback({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const background = tone === 'dark'
    ? 'from-slate-900 via-slate-800 to-[#345888]'
    : 'from-slate-100 via-white to-slate-100';

  return (
    <div className={`h-full min-h-[420px] w-full animate-pulse rounded-[28px] bg-gradient-to-br ${background}`} />
  );
}

export default StockroomCanvasFallback;

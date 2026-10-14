import { useEffect, useRef, useState } from 'react';

// Recharts must mount only after its parent has a real, positive size.
export default function MeasuredChart({ children, className = 'h-80 min-w-0' }) {
    const ref = useRef(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const element = ref.current;
        const sync = () => setSize({ width: element.clientWidth, height: element.clientHeight });
        sync();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(sync);
            observer.observe(element);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', sync);
        return () => window.removeEventListener('resize', sync);
    }, []);
    return <div ref={ref} className={className}>{size.width > 0 && size.height > 0 ? children(size) : <div role="status" className="flex h-full items-center justify-center text-sm text-primary-500">Preparing chart…</div>}</div>;
}

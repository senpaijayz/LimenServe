export default function PaymentOptions({value,onChange,disabled=false,allowToFollow=false}) {
  const unpaid=value==='to_follow';
  const supported=['cash','check','to_follow'].includes(value);
  return <div className="space-y-3">
    {!unpaid && <label className="block text-sm font-semibold text-primary-950">Payment method
      <select value={value} disabled={disabled} onChange={event=>onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-primary-300 bg-white p-3">
        <option value="cash">Cash</option>
        <option value="check">Check</option>
        {!supported && <option value={value} disabled>Previous method — review saved status</option>}
      </select>
    </label>}
    {allowToFollow && <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm ${unpaid?'border-amber-400 bg-amber-50 text-amber-950':'border-primary-300 bg-primary-50 text-primary-950'}`}>
      <input type="checkbox" checked={unpaid} disabled={disabled} onChange={event=>onChange(event.target.checked?'to_follow':'cash')} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-700" />
      <span><strong className="block">Payment to follow</strong><span className="mt-1 block">Release the parts now and save this order as unpaid. Record the payment later.</span></span>
    </label>}
  </div>;
}

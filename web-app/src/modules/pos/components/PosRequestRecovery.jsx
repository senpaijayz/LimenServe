import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
const stay=()=>{};
export default function PosRequestRecovery({posting}){
  if(!posting.pending)return null;
  return <Modal isOpen onClose={stay} title={posting.busy?'Saving POS order…':'Check the previous POS request'} size="md">
    <div className="space-y-4 text-sm text-primary-800">
      <p>Keep this reference until the result is confirmed. Retrying the same request will not create another order or deduct stock twice.</p>
      {posting.pending.id && <p className="break-all rounded-lg border border-primary-200 bg-primary-50 p-3 font-mono text-xs">{posting.pending.id}</p>}
      {posting.error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-950">{posting.error}</p>}
      {posting.pending.blocked ? <p role="alert">This tab has an unreadable request or a request owned by another staff account. Sign back in as the original staff member, or have an administrator check Sales and stock history before clearing browser data or starting another checkout.</p> : <div className="flex flex-wrap gap-2"><Button variant="secondary" isDisabled={posting.busy} onClick={posting.check}>Check saved result</Button><Button isLoading={posting.busy} isDisabled={posting.busy} onClick={posting.retry}>Retry same request</Button></div>}
    </div>
  </Modal>;
}

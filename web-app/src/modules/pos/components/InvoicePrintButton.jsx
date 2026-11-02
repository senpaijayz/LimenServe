import {useState} from 'react';
import {Printer} from 'lucide-react';
import Button from '../../../components/ui/Button';

async function loadLogo(url){
  const image=new Image();image.crossOrigin='anonymous';image.src=url;
  await image.decode();
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  const crop=url.endsWith('/LogoLimen.jpg')?[.07,.38,.86,.33]:[0,0,1,1];
  canvas.width=860;canvas.height=330;
  ctx.fillStyle='white';ctx.fillRect(0,0,860,330);
  ctx.drawImage(image,image.naturalWidth*crop[0],image.naturalHeight*crop[1],image.naturalWidth*crop[2],image.naturalHeight*crop[3],0,0,860,330);
  return {data:canvas.toDataURL('image/png'),format:'PNG'};
}
export default function InvoicePrintButton({receipt,children='Print order',...props}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className={props.fullWidth?'w-full':''}><Button {...props} isDisabled={props.isDisabled || !receipt} isLoading={busy} loadingLabel="Preparing print PDF…" leftIcon={<Printer className="h-4 w-4" />} onClick={async()=>{
    // Open synchronously so the customer's explicit print click is not blocked.
    const preview=window.open('about:blank','_blank');
    if(!preview){setError('Allow the print tab to open, then try again.');return;}
    preview.opener=null;setBusy(true);setError('');
    try{
      const [{createInvoicePdf},site]=await Promise.all([import('../utils/createInvoicePdf'),import('../../../services/cmsApi').then(({getPublicCmsSite})=>getPublicCmsSite()).catch(()=>({settings:{}}))]);
      const business=site.settings || {},logo=await loadLogo(business.logo_url || '/LogoLimen.jpg').catch(()=>null);
      const doc=createInvoicePdf(receipt,business,logo);
      const url=URL.createObjectURL(doc.output('blob'));preview.location.replace(url);
      setTimeout(()=>URL.revokeObjectURL(url),300000);
    }catch(e){preview.close();setError(e.message || 'The print document could not be prepared. Try again; do not create another sale.');}
    finally{setBusy(false);}
  }}>{children}</Button>{error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}</div>;
}

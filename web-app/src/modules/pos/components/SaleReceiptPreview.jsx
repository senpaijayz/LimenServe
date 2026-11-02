import {useEffect,useState} from 'react';
import {getPublicCmsSite} from '../../../services/cmsApi';
import SalesInvoiceBody from './SalesInvoiceBody';

export default function SaleReceiptPreview({receipt,printId='pos-receipt'}){
  const [business,setBusiness]=useState({});
  useEffect(()=>{let active=true;getPublicCmsSite().then(site=>{if(active)setBusiness(site.settings ?? {});}).catch(()=>{});return()=>{active=false;};},[]);
  return <SalesInvoiceBody receipt={receipt} business={business} printId={printId} />;
}

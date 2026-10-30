import { supabaseAdmin } from '../config/supabase.js';
import { createPackageDraftReviewReader } from './packageDraftReview.js';

const unwrap = ({data,error}) => {if(error)throw error;return data;};
export const packageDraftReviews=createPackageDraftReviewReader({
  loadPage:async(args)=>unwrap(await supabaseAdmin.schema('cms').rpc('managed_package_page',args)),
  loadRoot:async(id)=>unwrap(await supabaseAdmin.schema('cms').from('recommendation_packages')
    .select('id,package_name,package_type,publication_status,draft_revision,updated_at').eq('id',id).maybeSingle()),
});

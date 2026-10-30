export const PACKAGE_DRAFTS_HREF='/cms?section=packages&packageStatus=draft';
export const packageDraftReviewHref=id=>`${PACKAGE_DRAFTS_HREF}&reviewPackage=${encodeURIComponent(id)}`;
export const isPackageReviewEntry=params=>params.get('section')==='packages' || params.has('reviewPackage');

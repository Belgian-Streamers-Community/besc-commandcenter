import {socialInboxMetaRequirements} from './social-inbox.ts';
import {instagramPublicationScopes} from './instagram-publication.ts';

// Optional, separately switched Meta consent for extra rights on top of the statistics scopes:
// - 'inbox': direct-message read rights (Facebook or Instagram)
// - 'publish': Instagram feed publication rights (Instagram only)
// The default connection keeps requesting only the existing statistics scopes.
// This module only builds scope lists; it never contacts Meta or reads tokens.
export type MetaConsentPlatform='facebook'|'instagram';
export type MetaConsentCapability='stats'|'inbox'|'publish';

export const metaInboxConsentEnabled=(env:Record<string,string|undefined>)=>env.BESC_META_INBOX_CONSENT_ENABLED==='true';
export const metaPublishConsentEnabled=(env:Record<string,string|undefined>)=>env.BESC_META_PUBLISH_CONSENT_ENABLED==='true';

export function metaConsentCapability(raw:string|null|undefined,env:Record<string,string|undefined>):MetaConsentCapability{
 if(raw===null||raw===undefined||raw==='')return 'stats';
 if(raw==='inbox'&&metaInboxConsentEnabled(env))return 'inbox';
 if(raw==='publish'&&metaPublishConsentEnabled(env))return 'publish';
 throw new Error('meta_consent_capability_denied');
}

// Direct messages only: comment rights (pages_read_user_content, instagram_manage_comments) stay out.
export function metaInboxConsentScopes(platform:MetaConsentPlatform){
 return socialInboxMetaRequirements(platform,'direct');
}

// Exactly the scopes the existing publication queue and provider check; no comment, message or ads rights.
export function metaPublishConsentScopes(platform:MetaConsentPlatform){
 if(platform!=='instagram')throw new Error('meta_publish_consent_instagram_only');
 return [...instagramPublicationScopes];
}

export function metaConsentScopes(platform:MetaConsentPlatform,base:readonly string[],capability:MetaConsentCapability){
 const extra=capability==='inbox'?metaInboxConsentScopes(platform):capability==='publish'?metaPublishConsentScopes(platform):[];
 return [...new Set([...base,...extra])];
}

export function metaConsentRequiredScopes(platform:MetaConsentPlatform,statsRequired:readonly string[],capability:MetaConsentCapability){
 return metaConsentScopes(platform,statsRequired,capability);
}

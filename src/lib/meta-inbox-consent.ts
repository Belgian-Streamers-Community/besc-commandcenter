import {socialInboxMetaRequirements} from './social-inbox.ts';

// Optional, separately switched Meta consent for direct-message inbox rights.
// The default connection keeps requesting only the existing statistics scopes.
// This module only builds scope lists; it never contacts Meta or reads tokens.
export type MetaConsentPlatform='facebook'|'instagram';
export type MetaConsentCapability='stats'|'inbox';

export const metaInboxConsentEnabled=(env:Record<string,string|undefined>)=>env.BESC_META_INBOX_CONSENT_ENABLED==='true';

export function metaConsentCapability(raw:string|null|undefined,env:Record<string,string|undefined>):MetaConsentCapability{
 if(raw===null||raw===undefined||raw==='')return 'stats';
 if(raw==='inbox'&&metaInboxConsentEnabled(env))return 'inbox';
 throw new Error('meta_consent_capability_denied');
}

// Direct messages only: comment rights (pages_read_user_content, instagram_manage_comments) stay out.
export function metaInboxConsentScopes(platform:MetaConsentPlatform){
 return socialInboxMetaRequirements(platform,'direct');
}

export function metaConsentScopes(platform:MetaConsentPlatform,base:readonly string[],capability:MetaConsentCapability){
 const scopes=capability==='inbox'?[...base,...metaInboxConsentScopes(platform)]:[...base];
 return [...new Set(scopes)];
}

export function metaConsentRequiredScopes(platform:MetaConsentPlatform,statsRequired:readonly string[],capability:MetaConsentCapability){
 return metaConsentScopes(platform,statsRequired,capability);
}

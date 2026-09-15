// Public, read-only Supabase configuration. This publishable key is safe in a
// browser because Row Level Security grants SELECT only; all writes stay in the
// scheduled Edge Function with its server-only service-role key.
globalThis.SPORTS_HUB_SUPABASE = Object.freeze({
  url: 'https://oqrfdhoyyogjmiqmjhnp.supabase.co',
  key: 'sb_publishable_d5Jshv1Nakib7ROsgHVIVA_xHjp9QQV',
});

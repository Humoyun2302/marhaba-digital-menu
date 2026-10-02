-- pgcrypto lives in the extensions schema. These functions generate codes and hashes.
alter function public.create_restaurant_order(jsonb) set search_path = public, extensions;
alter function public.guest_order_by_token(text) set search_path = public, extensions;
alter function public.admin_reissue_tracking(uuid) set search_path = public, extensions;
alter function public.admin_create_link_code(uuid) set search_path = public, extensions;
alter function public.redeem_staff_link(text, bigint, text) set search_path = public, extensions;

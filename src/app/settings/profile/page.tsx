import { ActionForm } from "@/components/ActionForm";
import { updateProfileAction } from "@/actions/account";
import { getI18n } from "@/i18n/server";
import { requireViewer } from "@/lib/auth";
import { COUNTRY_CODES, countryName, flag } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";

export default async function EditProfile() {
  const viewer = await requireViewer("/settings/profile");
  const [{ t, locale }, supabase] = await Promise.all([getI18n(), createClient()]);
  const { data: d } = await supabase.from("profile_details").select("*").eq("user_id", viewer.id).maybeSingle();
  const opts = COUNTRY_CODES.map((c) => <option key={c} value={c}>{flag(c)} {countryName(c, locale)}</option>);
  const show = (name: string, checked: boolean) => (
    <label className="mt-1 flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" name={name} defaultChecked={checked} /> {t.profile.public}</label>);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t.profile.edit}</h1>
      <p className="text-sm text-ink-soft">{t.profile.privateNote}</p>
      <ActionForm action={updateProfileAction} submit={t.profile.save} className="card space-y-4">
        <label className="block"><span className="label">{t.profile.livingIn} *</span><select name="residence" defaultValue={viewer.residence} className="input">{opts}</select></label>
        <div><label className="block"><span className="label">{t.profile.nationality}</span>
          <select name="nationality" defaultValue={d?.nationality ?? ""} className="input"><option value="">—</option>{opts}</select></label>{show("show_nationality", d?.show_nationality ?? true)}</div>
        <div><label className="block"><span className="label">{t.profile.city}</span><input name="city" maxLength={60} defaultValue={d?.city ?? ""} className="input" placeholder="Kumamoto" /></label>{show("show_city", d?.show_city ?? true)}</div>
        <div><label className="block"><span className="label">{t.profile.age}</span><input name="age" type="number" min={16} max={120} defaultValue={d?.age ?? ""} className="input" /></label>{show("show_age", d?.show_age ?? false)}</div>
        <div><label className="block"><span className="label">{t.profile.bio}</span><textarea name="bio" maxLength={300} rows={4} defaultValue={d?.bio ?? ""} className="input" /></label>{show("show_bio", d?.show_bio ?? true)}</div>
      </ActionForm>
    </div>
  );
}

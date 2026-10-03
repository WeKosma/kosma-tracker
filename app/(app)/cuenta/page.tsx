import { requireSession } from "@/lib/session";
import AccountView from "@/components/AccountView";

export const metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const s = await requireSession();
  return <AccountView email={s.email} name={s.profile.full_name ?? ""} role={s.role} />;
}

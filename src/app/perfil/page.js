import { getProfessionalProfile } from "../../services/profile/profileStore.js";
import ProfileForm from "../../components/ProfileForm/ProfileForm.jsx";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getProfessionalProfile();
  return <ProfileForm initialProfile={profile} />;
}

"use server";

import { revalidatePath } from "next/cache";
import { getProfessionalProfile, saveProfessionalProfile } from "../../services/profile/profileStore.js";

export async function getProfessionalProfileAction() {
  return getProfessionalProfile();
}

export async function saveProfessionalProfileAction(input = {}) {
  const saved = await saveProfessionalProfile(input);
  revalidatePath("/perfil");
  revalidatePath("/crm");
  return saved;
}

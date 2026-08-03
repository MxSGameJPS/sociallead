"use server";

import { revalidatePath } from "next/cache";
import { generateLeadMessage } from "../../services/ai/leadMessageService.js";
import { getProfessionalProfile } from "../../services/profile/profileStore.js";
import {
  listProviderModels,
  listProvidersPublic,
  removeProvider,
  testProvider,
  upsertProvider,
} from "../../services/ai/providerService.js";

function refresh() {
  revalidatePath("/configuracoes/ia");
}

export async function listProvidersAction() {
  return listProvidersPublic();
}

export async function saveProviderAction(provider) {
  const saved = await upsertProvider(provider || {});
  refresh();
  return saved;
}

export async function deleteProviderAction(id) {
  await removeProvider(id);
  refresh();
}

export async function testProviderAction(id) {
  return testProvider(id);
}

export async function listModelsAction(id) {
  return listProviderModels(id);
}

export async function generateLeadMessageAction(payload) {
  const profile = await getProfessionalProfile();
  return generateLeadMessage({ ...(payload || {}), profile });
}

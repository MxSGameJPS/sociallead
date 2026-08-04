"use server";

import { revalidatePath } from "next/cache";
import { listIbgeCities } from "../../services/locations/ibge.js";
import { searchGooglePlaces } from "../../services/places/googlePlaces.js";
import { inferProfessionalCouncil } from "../../services/professions/professionalCouncils.js";

function refreshLeadViews() {
  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/crm");
}

export async function listCitiesAction(state) {
  return listIbgeCities(state);
}

export async function searchPlacesAction(filters) {
  return searchGooglePlaces(filters);
}

export async function addPlacesToCrmAction(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("Selecione ao menos um profissional.");
  if (items.length > 60) throw new Error("O limite por envio é de 60 profissionais.");

  const { importLeads } = await import("../../repositories/leadRepository.js");

  const leads = items.map(item => ({
    externalId: item.placeId || item.externalId,
    source: "Google Places",
    name: item.name,
    segment: item.segment,
    profession: item.profession || item.segment,
    council: item.council || inferProfessionalCouncil(item.profession || item.segment),
    city: item.city,
    location: item.location,
    address: item.address,
    score: item.score,
    grade: item.grade,
    phone: item.phone,
    whatsapp: null,
    instagram: item.instagram,
    site: item.site,
    weakSite: item.weakSite,
    googleRating: item.googleRating,
    googleReviews: item.googleReviews,
    problem: item.problem,
    offer: item.offer,
    reason: item.reason,
    mapsLink: item.mapsLink,
    stage: "novo",
    notes: item.possibleWhatsApp
      ? "Celular encontrado no Google Places. Pode ter WhatsApp, mas ainda não foi confirmado."
      : "Importado automaticamente do Google Places.",
  }));

  const result = await importLeads(leads);
  refreshLeadViews();
  return result;
}

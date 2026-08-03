import { createClient } from "@supabase/supabase-js";

let adminClient;

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
}

export function shouldUseSupabase() {
  return String(process.env.LEADFLOW_DATA_PROVIDER || "local").trim().toLowerCase() === "supabase";
}

export function isSupabaseConfigured() {
  return shouldUseSupabase() && Boolean(supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin() {
  if (!shouldUseSupabase()) {
    throw new Error("O Supabase está desativado. Defina LEADFLOW_DATA_PROVIDER=supabase para ativá-lo.");
  }

  const url = supabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");

  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { "X-Client-Info": "leadflow-server" },
      },
    });
  }

  return adminClient;
}

export function throwSupabaseError(error, action = "Operação no Supabase") {
  if (!error) return;
  const detail = [error.message, error.details, error.hint].filter(Boolean).join(" · ");
  throw new Error(`${action}: ${detail || "erro desconhecido"}`);
}

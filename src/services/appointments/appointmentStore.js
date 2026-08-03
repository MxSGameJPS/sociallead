import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const APPOINTMENT_DIR = path.join(process.cwd(), "data", "appointments");
const APPOINTMENT_FILE = path.join(APPOINTMENT_DIR, "appointments.json");
const STATUSES = new Set(["pending", "completed", "cancelled"]);

function clean(value, max = 3000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function normalizeDate(value) {
  const date = clean(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data de agendamento inválida.");
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error("Data de agendamento inválida.");
  return date;
}

function normalizeTime(value) {
  const time = clean(value, 10);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Hora de agendamento inválida.");
  return time;
}

function normalizeAppointment(input = {}) {
  const id = clean(input.id, 160);
  const leadId = clean(input.leadId, 160);
  if (!id) throw new Error("Identificador do agendamento inválido.");
  if (!leadId) throw new Error("Lead do agendamento não informado.");
  return {
    id,
    leadId,
    type: clean(input.type, 80) || "Reunião",
    date: normalizeDate(input.date),
    time: normalizeTime(input.time || "09:00"),
    notes: clean(input.notes, 3000),
    status: STATUSES.has(input.status) ? input.status : "pending",
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

async function readAll() {
  try {
    const raw = await fs.readFile(APPOINTMENT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => {
      try { return normalizeAppointment(item); } catch { return null; }
    }).filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function writeAll(items) {
  await fs.mkdir(APPOINTMENT_DIR, { recursive: true });
  const temporary = `${APPOINTMENT_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(items, null, 2), "utf8");
  await fs.rename(temporary, APPOINTMENT_FILE);
}

export async function listAppointments() {
  const items = await readAll();
  return items.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export async function createAppointment(input = {}) {
  const now = new Date().toISOString();
  const appointment = normalizeAppointment({
    ...input,
    id: `apt_${Date.now()}_${randomBytes(4).toString("hex")}`,
    createdAt: now,
    updatedAt: now,
  });
  const items = await readAll();
  items.push(appointment);
  await writeAll(items);
  return appointment;
}

export async function updateAppointmentStatus(id, status) {
  const appointmentId = clean(id, 160);
  if (!STATUSES.has(status)) throw new Error("Status do agendamento inválido.");
  const items = await readAll();
  const index = items.findIndex(item => item.id === appointmentId);
  if (index < 0) throw new Error("Agendamento não encontrado.");
  items[index] = normalizeAppointment({ ...items[index], status, updatedAt: new Date().toISOString() });
  await writeAll(items);
  return items[index];
}

export async function deleteAppointment(id) {
  const appointmentId = clean(id, 160);
  const items = await readAll();
  const next = items.filter(item => item.id !== appointmentId);
  if (next.length === items.length) throw new Error("Agendamento não encontrado.");
  await writeAll(next);
}

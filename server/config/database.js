/**
 * config/database.js
 *
 * Opens (or creates) the SQLite database using Node.js built-in `node:sqlite`
 * (available since Node 22.5.0 — zero native compilation required).
 *
 * Safe & Idempotent initialization:
 *  1. Creates all tables using CREATE TABLE IF NOT EXISTS
 *  2. Seeds from JSON files if each table is empty (idempotent guard)
 *
 * Dependency order: services → staff → customers → appointments → waitlist
 *
 * Exported: { db, initialise, createTables, seedAll, seedServices, seedStaff, seedCustomers, seedAppointments, seedWaitlist, loadJson }
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Load environment variables if dotenv is installed, otherwise proceed with defaults
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (_) {}

// ── Resolve paths ────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH
  ? (process.env.DB_PATH === ':memory:' ? ':memory:' : path.resolve(__dirname, '..', process.env.DB_PATH))
  : path.resolve(__dirname, '../db/salon.db');

const DATA_DIR = path.resolve(__dirname, '../data');

// Ensure database parent directory exists when using file-based storage
if (DB_PATH !== ':memory:') {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

// ── Open connection ──────────────────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);

// WAL mode for improved concurrency; enforce foreign key constraints
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ── Helpers ──────────────────────────────────────────────────────────────────
function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

function tableIsEmpty(targetDb, tableName) {
  const row = targetDb.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  return row.count === 0;
}

// ── CREATE TABLES ────────────────────────────────────────────────────────────
function createTables(targetDb = db) {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      category         TEXT NOT NULL,
      durationMinutes  INTEGER NOT NULL,
      price            REAL NOT NULL,
      currency         TEXT NOT NULL DEFAULT 'PKR',
      description      TEXT
    );

    CREATE TABLE IF NOT EXISTS staff (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      specializations   TEXT NOT NULL,
      workingDays       TEXT NOT NULL,
      workingHoursStart TEXT NOT NULL,
      workingHoursEnd   TEXT NOT NULL,
      breakStart        TEXT,
      breakEnd          TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id                     TEXT PRIMARY KEY,
      name                   TEXT NOT NULL,
      phone                  TEXT,
      email                  TEXT,
      consentToOffers        INTEGER NOT NULL DEFAULT 0,
      preferredContactMethod TEXT,
      bookingHistory         TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id                 TEXT PRIMARY KEY,
      customerId         TEXT NOT NULL REFERENCES customers(id),
      serviceId          TEXT NOT NULL REFERENCES services(id),
      staffId            TEXT NOT NULL REFERENCES staff(id),
      date               TEXT NOT NULL,
      startTime          TEXT NOT NULL,
      endTime            TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'confirmed'
                         CHECK (status IN ('confirmed','cancelled','recovered','completed')),
      cancelledAt        TEXT,
      cancellationReason TEXT,
      notes              TEXT
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id                  TEXT PRIMARY KEY,
      customerId          TEXT NOT NULL REFERENCES customers(id),
      serviceId           TEXT NOT NULL REFERENCES services(id),
      preferredStaffId    TEXT REFERENCES staff(id),
      preferAnyStaff      INTEGER NOT NULL DEFAULT 0,
      availableDates      TEXT NOT NULL DEFAULT '[]',
      availableTimeSlots  TEXT NOT NULL DEFAULT '[]',
      priority            INTEGER NOT NULL DEFAULT 3,
      consentGiven        INTEGER NOT NULL DEFAULT 0,
      addedAt             TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'waiting'
                          CHECK (status IN ('waiting','offered','booked','expired'))
    );

    CREATE TABLE IF NOT EXISTS offers (
      id               TEXT PRIMARY KEY,
      waitlistId       TEXT NOT NULL REFERENCES waitlist(id),
      appointmentId    TEXT NOT NULL REFERENCES appointments(id),
      customerId       TEXT NOT NULL REFERENCES customers(id),
      messageText      TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending_approval'
                       CHECK (status IN
                         ('pending_approval','approved','sent',
                          'accepted','declined','no_reply','expired')),
      generatedAt      TEXT NOT NULL,
      approvedAt       TEXT,
      sentAt           TEXT,
      respondedAt      TEXT,
      aiGenerated      INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ── SEED FUNCTIONS ───────────────────────────────────────────────────────────
function seedServices(targetDb = db) {
  if (!tableIsEmpty(targetDb, 'services')) return 0;
  const insert = targetDb.prepare(`
    INSERT INTO services (id, name, category, durationMinutes, price, currency, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const records = loadJson('services.json');
  records.forEach(s => insert.run(s.id, s.name, s.category, s.durationMinutes, s.price, s.currency, s.description));
  return records.length;
}

function seedStaff(targetDb = db) {
  if (!tableIsEmpty(targetDb, 'staff')) return 0;
  const insert = targetDb.prepare(`
    INSERT INTO staff
      (id, name, specializations, workingDays, workingHoursStart, workingHoursEnd, breakStart, breakEnd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const records = loadJson('staff.json');
  records.forEach(s => insert.run(
    s.id,
    s.name,
    JSON.stringify(s.specializations),
    JSON.stringify(s.workingDays),
    s.workingHours.start,
    s.workingHours.end,
    s.breakTime ? s.breakTime.start : null,
    s.breakTime ? s.breakTime.end   : null,
  ));
  return records.length;
}

function seedCustomers(targetDb = db) {
  if (!tableIsEmpty(targetDb, 'customers')) return 0;
  const insert = targetDb.prepare(`
    INSERT INTO customers
      (id, name, phone, email, consentToOffers, preferredContactMethod, bookingHistory)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const records = loadJson('customers.json');
  records.forEach(c => insert.run(
    c.id, c.name, c.phone, c.email,
    c.consentToOffers ? 1 : 0,
    c.preferredContactMethod,
    JSON.stringify(c.bookingHistory),
  ));
  return records.length;
}

function seedAppointments(targetDb = db) {
  if (!tableIsEmpty(targetDb, 'appointments')) return 0;
  const insert = targetDb.prepare(`
    INSERT INTO appointments
      (id, customerId, serviceId, staffId, date, startTime, endTime,
       status, cancelledAt, cancellationReason, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const records = loadJson('appointments.json');
  records.forEach(a => insert.run(
    a.id, a.customerId, a.serviceId, a.staffId,
    a.date, a.startTime, a.endTime, a.status,
    a.cancelledAt        || null,
    a.cancellationReason || null,
    a.notes              || null,
  ));
  return records.length;
}

function seedWaitlist(targetDb = db) {
  if (!tableIsEmpty(targetDb, 'waitlist')) return 0;
  const insert = targetDb.prepare(`
    INSERT INTO waitlist
      (id, customerId, serviceId, preferredStaffId, preferAnyStaff,
       availableDates, availableTimeSlots, priority, consentGiven, addedAt, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const records = loadJson('waitlist.json');
  records.forEach(w => insert.run(
    w.id, w.customerId, w.serviceId,
    w.preferredStaffId || null,
    w.preferAnyStaff ? 1 : 0,
    JSON.stringify(w.availableDates),
    JSON.stringify(w.availableTimeSlots),
    w.priority,
    w.consentGiven ? 1 : 0,
    w.addedAt,
    w.status,
  ));
  return records.length;
}

function seedAll(targetDb = db) {
  const counts = {
    services: seedServices(targetDb),
    staff: seedStaff(targetDb),
    customers: seedCustomers(targetDb),
    appointments: seedAppointments(targetDb),
    waitlist: seedWaitlist(targetDb),
  };
  return counts;
}

// ── INITIALISE ───────────────────────────────────────────────────────────────
function initialise(targetDb = db) {
  createTables(targetDb);
  const seeded = seedAll(targetDb);
  return seeded;
}

if (require.main === module) {
  console.log('Initialising database…');
  const counts = initialise();
  console.log('Database initialisation complete. Seed counts:', counts);
}

module.exports = {
  db,
  initialise,
  createTables,
  seedAll,
  seedServices,
  seedStaff,
  seedCustomers,
  seedAppointments,
  seedWaitlist,
  loadJson,
};

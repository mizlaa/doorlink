-- Database-level rules Prisma's schema language can't express.
--
-- Run after every `prisma db push` (the `db:push` npm script does):
--   npm run db:constraints
-- Safe to run repeatedly.

-- A technician can't be in two places at once. The booking action already
-- checks for a clash under a lock; this makes the database itself refuse an
-- overlapping live visit, whatever wrote it. Cancelled, completed and
-- no-show visits don't block the slot. Back-to-back visits are allowed
-- (the range excludes its end).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_no_technician_overlap";
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_no_technician_overlap"
  EXCLUDE USING gist (
    "technicianId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("technicianId" IS NOT NULL AND status IN ('BOOKED', 'EN_ROUTE', 'IN_PROGRESS'));

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_ends_after_start";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_ends_after_start" CHECK ("endsAt" > "startsAt");

ALTER TABLE "TechnicianTimeOff" DROP CONSTRAINT IF EXISTS "TimeOff_ends_after_start";
ALTER TABLE "TechnicianTimeOff" ADD CONSTRAINT "TimeOff_ends_after_start" CHECK ("endsAt" > "startsAt");

-- Money can't go negative, and a payment is always for something.
ALTER TABLE "InvoicePayment" DROP CONSTRAINT IF EXISTS "InvoicePayment_positive";
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_positive" CHECK ("amountCents" > 0);

ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_totals_sane";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_totals_sane"
  CHECK ("totalCents" >= 0 AND "gstCents" >= 0 AND "paidCents" >= 0);

-- An issued invoice always has its number and frozen copy.
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_issued_complete";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issued_complete"
  CHECK (status = 'DRAFT' OR (number IS NOT NULL AND snapshot IS NOT NULL AND "issuedAt" IS NOT NULL));

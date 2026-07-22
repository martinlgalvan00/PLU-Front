-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('owner', 'admin', 'operator', 'finance', 'gate', 'viewer');

-- CreateEnum
CREATE TYPE "OrganizationMemberStatus" AS ENUM ('invited', 'active', 'suspended', 'disabled');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('draft', 'active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "EventVisibilityStatus" AS ENUM ('draft', 'published', 'hidden', 'archived');

-- CreateEnum
CREATE TYPE "EventLifecycleStatus" AS ENUM ('upcoming', 'registration_open', 'sales_open', 'closed', 'live', 'finished', 'cancelled');

-- CreateEnum
CREATE TYPE "EventScheduleItemType" AS ENUM ('weigh_in', 'rules_meeting', 'lifting', 'awards', 'doors', 'other');

-- CreateEnum
CREATE TYPE "CapacityScope" AS ENUM ('event', 'day', 'division', 'category', 'ticket_type', 'sale_window');

-- CreateEnum
CREATE TYPE "PaymentOrderItemType" AS ENUM ('membership_period', 'event_registration', 'ticket_sale_window', 'ticket_addon', 'manual_adjustment');

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('monthly', 'annual');

-- CreateEnum
CREATE TYPE "BillingCollectionMode" AS ENUM ('one_time', 'recurring');

-- CreateEnum
CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('pending', 'authorized', 'paused', 'past_due', 'cancelled', 'ended');

-- CreateEnum
CREATE TYPE "MembershipCycleStatus" AS ENUM ('pending', 'active', 'expired', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "TicketOrderStatus" AS ENUM ('creado', 'pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado');

-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('pending', 'processing', 'processed', 'failed', 'cancelled');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentOrderType" ADD VALUE 'ticket_order';
ALTER TYPE "PaymentOrderType" ADD VALUE 'combo';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecentEntityType" ADD VALUE 'person';
ALTER TYPE "RecentEntityType" ADD VALUE 'ticket_order';

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'usada';

-- DropForeignKey
ALTER TABLE "AthleteDocument" DROP CONSTRAINT "AthleteDocument_athleteId_fkey";

-- DropForeignKey
ALTER TABLE "CheckIn" DROP CONSTRAINT "CheckIn_registrationId_fkey";

-- DropForeignKey
ALTER TABLE "EventRegistration" DROP CONSTRAINT "EventRegistration_athleteId_fkey";

-- DropForeignKey
ALTER TABLE "LiftingResult" DROP CONSTRAINT "LiftingResult_athleteId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_athleteId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_athleteId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_registrationId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentOrder" DROP CONSTRAINT "PaymentOrder_athleteId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_orderId_fkey";

-- DropIndex
DROP INDEX "CheckIn_registrationId_key";

-- DropIndex
DROP INDEX "Event_eventDate_idx";

-- DropIndex
DROP INDEX "Event_slug_key";

-- DropIndex
DROP INDEX "Event_status_eventDate_idx";

-- DropIndex
DROP INDEX "EventRegistration_athleteId_status_idx";

-- DropIndex
DROP INDEX "EventRegistration_eventId_athleteId_key";

-- DropIndex
DROP INDEX "IntegrationEvent_provider_externalId_key";

-- DropIndex
DROP INDEX "LiftingResult_athleteId_idx";

-- DropIndex
DROP INDEX "LiftingResult_eventId_idx";

-- DropIndex
DROP INDEX "Membership_athleteId_status_idx";

-- DropIndex
DROP INDEX "Membership_athleteId_year_key";

-- DropIndex
DROP INDEX "Membership_memberCode_key";

-- DropIndex
DROP INDEX "Payment_athleteId_status_idx";

-- DropIndex
DROP INDEX "Payment_externalPaymentId_key";

-- DropIndex
DROP INDEX "Payment_orderId_idx";

-- DropIndex
DROP INDEX "PaymentAllocation_registrationId_idx";

-- DropIndex
DROP INDEX "PaymentOrder_athleteId_status_idx";

-- DropIndex
DROP INDEX "Ticket_attendeeDni_idx";

-- DropIndex
DROP INDEX "Ticket_ticketCode_key";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CheckIn" DROP COLUMN "registrationId",
ADD COLUMN     "eventRegistrationId" TEXT,
ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "capacity",
DROP COLUMN "currency",
DROP COLUMN "eventDate",
DROP COLUMN "location",
DROP COLUMN "price",
DROP COLUMN "registrationClosesAt",
DROP COLUMN "registrationOpensAt",
DROP COLUMN "rules",
DROP COLUMN "status",
DROP COLUMN "venue",
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "endsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "lifecycleStatus" "EventLifecycleStatus" NOT NULL DEFAULT 'upcoming',
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "venueId" TEXT,
ADD COLUMN     "visibilityStatus" "EventVisibilityStatus" NOT NULL DEFAULT 'draft';

-- AlterTable
ALTER TABLE "EventRegistration" DROP COLUMN "athleteId",
DROP COLUMN "category",
DROP COLUMN "division",
ADD COLUMN     "categoryId" TEXT NOT NULL,
ADD COLUMN     "divisionId" TEXT NOT NULL,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "personId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ExportJob" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "IntegrationEvent" ADD COLUMN     "action" TEXT,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "providerNotificationId" TEXT,
ADD COLUMN     "providerResourceId" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "signatureValid" BOOLEAN;

-- AlterTable
ALTER TABLE "LiftingResult" DROP COLUMN "athleteId",
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "personId" TEXT;

-- AlterTable
ALTER TABLE "Membership" DROP COLUMN "athleteId",
DROP COLUMN "expirationDate",
DROP COLUMN "startDate",
DROP COLUMN "year",
ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "membershipPeriodId" TEXT NOT NULL,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "personId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "athleteId",
DROP COLUMN "orderId",
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "payerPersonId" TEXT,
ADD COLUMN     "paymentOrderId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PaymentAllocation" DROP COLUMN "registrationId",
ADD COLUMN     "eventRegistrationId" TEXT,
ADD COLUMN     "membershipCycleId" TEXT,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "paymentOrderItemId" TEXT,
ADD COLUMN     "ticketOrderId" TEXT;

-- AlterTable
ALTER TABLE "PaymentOrder" DROP COLUMN "amount",
DROP COLUMN "athleteId",
DROP COLUMN "orderType",
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "payerPersonId" TEXT,
ADD COLUMN     "totalAmount" INTEGER NOT NULL,
ADD COLUMN     "type" "PaymentOrderType" NOT NULL;

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "attendeeDni",
DROP COLUMN "dayPass",
DROP COLUMN "orderId",
DROP COLUMN "unitPrice",
ADD COLUMN     "attendeeDocument" TEXT NOT NULL,
ADD COLUMN     "attendeePersonId" TEXT,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "saleWindowId" TEXT NOT NULL,
ADD COLUMN     "ticketOrderId" TEXT NOT NULL,
ADD COLUMN     "ticketTypeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TicketOrder" DROP COLUMN "amount",
ADD COLUMN     "buyerPersonId" TEXT,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "paymentOrderId" TEXT,
ADD COLUMN     "paymentProofPath" TEXT,
ADD COLUMN     "paymentProofUploadedAt" TIMESTAMP(3),
ADD COLUMN     "totalAmount" INTEGER NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "TicketOrderStatus" NOT NULL DEFAULT 'creado';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "personId" TEXT;

-- DropTable
DROP TABLE "Athlete";

-- DropTable
DROP TABLE "AthleteDocument";

-- DropEnum
DROP TYPE "EventStatus";

-- DropEnum
DROP TYPE "TicketDayPass";

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Argentina',
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL DEFAULT 'operator',
    "status" "OrganizationMemberStatus" NOT NULL DEFAULT 'invited',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Argentina',
    "province" TEXT,
    "city" TEXT,
    "competitiveSex" "CompetitiveSex",
    "estimatedBodyweightKg" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonDocument" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "documentType" "AthleteDocumentType" NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Argentina',
    "primary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationAthlete" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "AthleteStatus" NOT NULL DEFAULT 'pre_registrado',
    "defaultDivisionId" TEXT,
    "defaultCategoryId" TEXT,
    "gym" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationAthlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "billingFrequency" "BillingFrequency" NOT NULL DEFAULT 'annual',
    "collectionMode" "BillingCollectionMode" NOT NULL DEFAULT 'one_time',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipPlanId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "billingFrequency" "BillingFrequency" NOT NULL DEFAULT 'annual',
    "collectionMode" "BillingCollectionMode" NOT NULL DEFAULT 'one_time',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "providerPlanId" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "paymentId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "MembershipCycleStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "membershipPlanId" TEXT NOT NULL,
    "membershipPeriodId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'mercado_pago',
    "providerSubscriptionId" TEXT,
    "providerPlanId" TEXT,
    "externalRef" TEXT NOT NULL,
    "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'pending',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Argentina',
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistrationWindow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistrationWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventScheduleItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EventScheduleItemType" NOT NULL DEFAULT 'other',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDivision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCapacityRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "scope" "CapacityScope" NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT '',
    "limitCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCapacityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSaleWindow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "quota" INTEGER,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketSaleWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAddon" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketAddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAddonOption" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketAddonOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAddonSelection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAddonSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAddonRedemption" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "redeemedById" TEXT,
    "gate" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAddonRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrderItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "itemType" "PaymentOrderItemType" NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "type" TEXT NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_role_status_idx" ON "OrganizationMember"("organizationId", "role", "status");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_status_idx" ON "OrganizationMember"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Person_lastName_firstName_idx" ON "Person"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Person_email_idx" ON "Person"("email");

-- CreateIndex
CREATE INDEX "PersonDocument_personId_idx" ON "PersonDocument"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonDocument_documentType_documentNumber_key" ON "PersonDocument"("documentType", "documentNumber");

-- CreateIndex
CREATE INDEX "OrganizationAthlete_organizationId_status_idx" ON "OrganizationAthlete"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationAthlete_personId_status_idx" ON "OrganizationAthlete"("personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationAthlete_organizationId_personId_key" ON "OrganizationAthlete"("organizationId", "personId");

-- CreateIndex
CREATE INDEX "MembershipPlan_organizationId_status_idx" ON "MembershipPlan"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_organizationId_code_key" ON "MembershipPlan"("organizationId", "code");

-- CreateIndex
CREATE INDEX "MembershipPeriod_organizationId_status_startsAt_idx" ON "MembershipPeriod"("organizationId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "MembershipPeriod_providerPlanId_idx" ON "MembershipPeriod"("providerPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPeriod_organizationId_membershipPlanId_year_key" ON "MembershipPeriod"("organizationId", "membershipPlanId", "year");

-- CreateIndex
CREATE INDEX "MembershipCycle_organizationId_status_endsAt_idx" ON "MembershipCycle"("organizationId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "MembershipCycle_membershipId_startsAt_endsAt_idx" ON "MembershipCycle"("membershipId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "MembershipCycle_paymentId_idx" ON "MembershipCycle"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCycle_membershipId_paymentOrderId_key" ON "MembershipCycle"("membershipId", "paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_externalRef_key" ON "BillingSubscription"("externalRef");

-- CreateIndex
CREATE INDEX "BillingSubscription_organizationId_status_nextBillingAt_idx" ON "BillingSubscription"("organizationId", "status", "nextBillingAt");

-- CreateIndex
CREATE INDEX "BillingSubscription_personId_status_idx" ON "BillingSubscription"("personId", "status");

-- CreateIndex
CREATE INDEX "BillingSubscription_membershipId_status_idx" ON "BillingSubscription"("membershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_provider_providerSubscriptionId_key" ON "BillingSubscription"("provider", "providerSubscriptionId");

-- CreateIndex
CREATE INDEX "Venue_organizationId_city_idx" ON "Venue"("organizationId", "city");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_organizationId_name_city_key" ON "Venue"("organizationId", "name", "city");

-- CreateIndex
CREATE INDEX "EventRegistrationWindow_organizationId_status_opensAt_idx" ON "EventRegistrationWindow"("organizationId", "status", "opensAt");

-- CreateIndex
CREATE INDEX "EventRegistrationWindow_eventId_status_idx" ON "EventRegistrationWindow"("eventId", "status");

-- CreateIndex
CREATE INDEX "EventScheduleItem_eventId_startsAt_idx" ON "EventScheduleItem"("eventId", "startsAt");

-- CreateIndex
CREATE INDEX "EventDivision_organizationId_status_idx" ON "EventDivision"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventDivision_eventId_code_key" ON "EventDivision"("eventId", "code");

-- CreateIndex
CREATE INDEX "EventCategory_organizationId_status_idx" ON "EventCategory"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventCategory_eventId_code_key" ON "EventCategory"("eventId", "code");

-- CreateIndex
CREATE INDEX "EventCapacityRule_organizationId_scope_idx" ON "EventCapacityRule"("organizationId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "EventCapacityRule_eventId_scope_scopeKey_key" ON "EventCapacityRule"("eventId", "scope", "scopeKey");

-- CreateIndex
CREATE INDEX "TicketType_organizationId_status_idx" ON "TicketType"("organizationId", "status");

-- CreateIndex
CREATE INDEX "TicketType_eventId_status_idx" ON "TicketType"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_eventId_code_key" ON "TicketType"("eventId", "code");

-- CreateIndex
CREATE INDEX "TicketSaleWindow_organizationId_status_opensAt_idx" ON "TicketSaleWindow"("organizationId", "status", "opensAt");

-- CreateIndex
CREATE INDEX "TicketSaleWindow_eventId_status_idx" ON "TicketSaleWindow"("eventId", "status");

-- CreateIndex
CREATE INDEX "TicketSaleWindow_ticketTypeId_status_idx" ON "TicketSaleWindow"("ticketTypeId", "status");

-- CreateIndex
CREATE INDEX "TicketAddon_organizationId_status_idx" ON "TicketAddon"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAddon_eventId_code_key" ON "TicketAddon"("eventId", "code");

-- CreateIndex
CREATE INDEX "TicketAddonOption_organizationId_status_idx" ON "TicketAddonOption"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAddonOption_addonId_code_key" ON "TicketAddonOption"("addonId", "code");

-- CreateIndex
CREATE INDEX "TicketAddonSelection_organizationId_createdAt_idx" ON "TicketAddonSelection"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAddonSelection_ticketId_optionId_key" ON "TicketAddonSelection"("ticketId", "optionId");

-- CreateIndex
CREATE INDEX "TicketAddonRedemption_organizationId_redeemedAt_idx" ON "TicketAddonRedemption"("organizationId", "redeemedAt");

-- CreateIndex
CREATE INDEX "TicketAddonRedemption_selectionId_idx" ON "TicketAddonRedemption"("selectionId");

-- CreateIndex
CREATE INDEX "PaymentOrderItem_organizationId_itemType_idx" ON "PaymentOrderItem"("organizationId", "itemType");

-- CreateIndex
CREATE INDEX "PaymentOrderItem_paymentOrderId_idx" ON "PaymentOrderItem"("paymentOrderId");

-- CreateIndex
CREATE INDEX "OutboxEvent_organizationId_status_scheduledAt_idx" ON "OutboxEvent"("organizationId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_type_status_idx" ON "OutboxEvent"("type", "status");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_eventRegistrationId_key" ON "CheckIn"("eventRegistrationId");

-- CreateIndex
CREATE INDEX "CheckIn_organizationId_scannedAt_idx" ON "CheckIn"("organizationId", "scannedAt");

-- CreateIndex
CREATE INDEX "EmailLog_organizationId_templateKey_status_idx" ON "EmailLog"("organizationId", "templateKey", "status");

-- CreateIndex
CREATE INDEX "Event_organizationId_visibilityStatus_startsAt_idx" ON "Event"("organizationId", "visibilityStatus", "startsAt");

-- CreateIndex
CREATE INDEX "Event_organizationId_lifecycleStatus_startsAt_idx" ON "Event"("organizationId", "lifecycleStatus", "startsAt");

-- CreateIndex
CREATE INDEX "Event_venueId_startsAt_idx" ON "Event"("venueId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_organizationId_slug_key" ON "Event"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "EventRegistration_organizationId_status_idx" ON "EventRegistration"("organizationId", "status");

-- CreateIndex
CREATE INDEX "EventRegistration_personId_status_idx" ON "EventRegistration"("personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_personId_key" ON "EventRegistration"("eventId", "personId");

-- CreateIndex
CREATE INDEX "ExportJob_organizationId_type_status_idx" ON "ExportJob"("organizationId", "type", "status");

-- CreateIndex
CREATE INDEX "IntegrationEvent_organizationId_provider_status_idx" ON "IntegrationEvent"("organizationId", "provider", "status");

-- CreateIndex
CREATE INDEX "IntegrationEvent_provider_providerResourceId_idx" ON "IntegrationEvent"("provider", "providerResourceId");

-- CreateIndex
CREATE INDEX "IntegrationEvent_provider_externalId_idx" ON "IntegrationEvent"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_provider_providerNotificationId_key" ON "IntegrationEvent"("provider", "providerNotificationId");

-- CreateIndex
CREATE INDEX "LiftingResult_organizationId_eventId_idx" ON "LiftingResult"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "LiftingResult_personId_idx" ON "LiftingResult"("personId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_status_expiresAt_idx" ON "Membership"("organizationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Membership_personId_status_idx" ON "Membership"("personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_memberCode_key" ON "Membership"("organizationId", "memberCode");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_personId_membershipPeriodId_key" ON "Membership"("organizationId", "personId", "membershipPeriodId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_status_createdAt_idx" ON "Payment"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_paymentOrderId_idx" ON "Payment"("paymentOrderId");

-- CreateIndex
CREATE INDEX "Payment_payerPersonId_status_idx" ON "Payment"("payerPersonId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_externalPaymentId_key" ON "Payment"("provider", "externalPaymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_organizationId_createdAt_idx" ON "PaymentAllocation"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentOrderItemId_idx" ON "PaymentAllocation"("paymentOrderItemId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_membershipCycleId_idx" ON "PaymentAllocation"("membershipCycleId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_eventRegistrationId_idx" ON "PaymentAllocation"("eventRegistrationId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_ticketOrderId_idx" ON "PaymentAllocation"("ticketOrderId");

-- CreateIndex
CREATE INDEX "PaymentOrder_organizationId_status_createdAt_idx" ON "PaymentOrder"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOrder_payerPersonId_status_idx" ON "PaymentOrder"("payerPersonId", "status");

-- CreateIndex
CREATE INDEX "Ticket_ticketTypeId_status_idx" ON "Ticket"("ticketTypeId", "status");

-- CreateIndex
CREATE INDEX "Ticket_saleWindowId_status_idx" ON "Ticket"("saleWindowId", "status");

-- CreateIndex
CREATE INDEX "Ticket_attendeeDocument_idx" ON "Ticket"("attendeeDocument");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_organizationId_ticketCode_key" ON "Ticket"("organizationId", "ticketCode");

-- CreateIndex
CREATE INDEX "TicketOrder_organizationId_status_createdAt_idx" ON "TicketOrder"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TicketOrder_eventId_status_idx" ON "TicketOrder"("eventId", "status");

-- CreateIndex
CREATE INDEX "TicketOrder_paymentOrderId_idx" ON "TicketOrder"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocument" ADD CONSTRAINT "PersonDocument_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAthlete" ADD CONSTRAINT "OrganizationAthlete_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAthlete" ADD CONSTRAINT "OrganizationAthlete_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAthlete" ADD CONSTRAINT "OrganizationAthlete_defaultDivisionId_fkey" FOREIGN KEY ("defaultDivisionId") REFERENCES "EventDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAthlete" ADD CONSTRAINT "OrganizationAthlete_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "EventCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPeriod" ADD CONSTRAINT "MembershipPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPeriod" ADD CONSTRAINT "MembershipPeriod_membershipPlanId_fkey" FOREIGN KEY ("membershipPlanId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_membershipPeriodId_fkey" FOREIGN KEY ("membershipPeriodId") REFERENCES "MembershipPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCycle" ADD CONSTRAINT "MembershipCycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCycle" ADD CONSTRAINT "MembershipCycle_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCycle" ADD CONSTRAINT "MembershipCycle_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCycle" ADD CONSTRAINT "MembershipCycle_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_membershipPlanId_fkey" FOREIGN KEY ("membershipPlanId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_membershipPeriodId_fkey" FOREIGN KEY ("membershipPeriodId") REFERENCES "MembershipPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistrationWindow" ADD CONSTRAINT "EventRegistrationWindow_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventScheduleItem" ADD CONSTRAINT "EventScheduleItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDivision" ADD CONSTRAINT "EventDivision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDivision" ADD CONSTRAINT "EventDivision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCategory" ADD CONSTRAINT "EventCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCategory" ADD CONSTRAINT "EventCategory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCapacityRule" ADD CONSTRAINT "EventCapacityRule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "EventDivision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSaleWindow" ADD CONSTRAINT "TicketSaleWindow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSaleWindow" ADD CONSTRAINT "TicketSaleWindow_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSaleWindow" ADD CONSTRAINT "TicketSaleWindow_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_buyerPersonId_fkey" FOREIGN KEY ("buyerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_saleWindowId_fkey" FOREIGN KEY ("saleWindowId") REFERENCES "TicketSaleWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketOrderId_fkey" FOREIGN KEY ("ticketOrderId") REFERENCES "TicketOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_attendeePersonId_fkey" FOREIGN KEY ("attendeePersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAddon" ADD CONSTRAINT "TicketAddon_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAddonOption" ADD CONSTRAINT "TicketAddonOption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAddonOption" ADD CONSTRAINT "TicketAddonOption_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "TicketAddon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAddonSelection" ADD CONSTRAINT "TicketAddonSelection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAddonSelection" ADD CONSTRAINT "TicketAddonSelection_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAddonSelection" ADD CONSTRAINT "TicketAddonSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "TicketAddonOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAddonRedemption" ADD CONSTRAINT "TicketAddonRedemption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAddonRedemption" ADD CONSTRAINT "TicketAddonRedemption_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "TicketAddonSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "EventRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_payerPersonId_fkey" FOREIGN KEY ("payerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrderItem" ADD CONSTRAINT "PaymentOrderItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrderItem" ADD CONSTRAINT "PaymentOrderItem_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerPersonId_fkey" FOREIGN KEY ("payerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentOrderItemId_fkey" FOREIGN KEY ("paymentOrderItemId") REFERENCES "PaymentOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_membershipCycleId_fkey" FOREIGN KEY ("membershipCycleId") REFERENCES "MembershipCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "EventRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_ticketOrderId_fkey" FOREIGN KEY ("ticketOrderId") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftingResult" ADD CONSTRAINT "LiftingResult_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;


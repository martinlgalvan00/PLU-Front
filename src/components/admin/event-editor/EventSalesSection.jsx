import { money } from '../../../lib/format.js'
import AdminTicketSalesStatus from '../AdminTicketSalesStatus.jsx'
import { Banknote, RotateCcw, Ticket, Users } from 'lucide-react'
import DateTimeLocalInput from '../../ui/DateTimeLocalInput.jsx'
import { DEFAULT_EVENT_PRICING } from '../../../lib/eventPricing.js'
import AdminEventPriceSchedule from '../AdminEventPriceSchedule.jsx'
import { effectiveEventChannelsFor } from '../../../lib/eventPaymentChannels.js'
import { platformCellsFor } from '../../../lib/platformPaymentChannels.js'
import EventPaymentChannelMatrix from './EventPaymentChannelMatrix.jsx'
import { buildPaymentReadiness } from '../../../lib/eventPaymentReadiness.js'
import { env } from '../../../config/env.js'
import MercadoPagoAccountStatus from '../payment-accounts/MercadoPagoAccountStatus.jsx'
import MercadoPagoConnectControl from '../payment-accounts/MercadoPagoConnectControl.jsx'
import {
  mercadoPagoAccountStatus,
  paymentAccountOptionLabel,
} from '../payment-accounts/paymentAccountText.js'
import AdminTicketAddonsEditor from '../AdminTicketAddonsEditor.jsx'
import AdminTicketTypesEditor from '../AdminTicketTypesEditor.jsx'
import { updatePricingField } from './draftPatches.js'
import { CapacityPublicBreakdown, FormField } from './parts.jsx'

/** Public key y access token de MP: `APP_USR-…` en producción, `TEST-…` en sandbox. */
const MP_CREDENTIAL_PATTERN = /^(APP_USR|TEST)-[A-Za-z0-9-]{8,}$/

export default function EventSalesSection({
  // Cuenta por evento (organizador): no abre medios cerrados por PLU, no carga cuentas de
  // cobro sueltas ni restablece los medios (perdería lo que PLU le abrió).
  eventScoped = false,
  activePanelRef,
  t,
  essentials,
  slotsTotal,
  draft,
  locale,
  ticketSalesEnabled,
  ticketTypeCount,
  ticketChannelCount,
  showTicketsChapter,
  salesChapter,
  salesChaptersWithErrors,
  handleSalesChapterChange,
  registeredCount,
  fillPercent,
  slotsRemaining,
  err,
  patchDraft,
  canEdit,
  publicCapacityPreview,
  onSetEventRegistrationPrice,
  sourceEvent,
  onClearEventPriceSchedule,
  platformChannels,
  mpSecretsKeyConfigured,
  applyMpProfile,
  mpProfilesLoading,
  mpProfiles,
  selectedMpProfile,
  setMpCreateOpen,
  mpCreateOpen,
  mpDraft,
  setMpDraft,
  mpCreateError,
  mpCreating,
  handleCreateMpProfile,
  applyBankProfile,
  bankProfilesLoading,
  bankProfiles,
  selectedBankProfile,
  fieldErrors,
  accordion,
  onRequestSection,
  mpOAuthAvailable = false,
  onMpProfileConnected,
}) {
  // Los bloques de perfil (alias de transferencia, cuenta de MP) se necesitan
  // mientras el canal se use en algún concepto: abierto por la plataforma o por
  // este evento, y no cerrado acá.
  const channelOpenHere = (channel) =>
    ['registration', 'ticket'].some((concept) =>
      effectiveEventChannelsFor(
        draft.paymentChannelOverrides,
        concept,
        platformCellsFor(platformChannels?.platform, concept),
      ).includes(channel),
    )

  // Mismo criterio que el checkout (`resolveCashPaymentDetails`): el lugar
  // propio manda y, vacío, se cobra en la sede del evento.
  const eventVenueLabel = [draft.venue, draft.location]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' · ')
  // Con una cuenta elegida los datos son de la cuenta, no del evento: se muestran
  // de solo lectura. Editarlos a mano desvinculaba el perfil en silencio y, al
  // guardar, creaba otro; ahora eso es una decisión explícita ("Usar otros datos").
  const bankLinked = Boolean(draft.bankTransferProfileId)
  const bankSummary = {
    alias: selectedBankProfile?.config?.alias ?? draft.bankTransfer?.alias ?? '',
    cbu: selectedBankProfile?.config?.cbu ?? draft.bankTransfer?.cbu ?? '',
    holder: selectedBankProfile?.config?.holder ?? draft.bankTransfer?.holder ?? '',
  }
  const ownCashPlace = String(draft.cashPayment?.place ?? '').trim()
  const cashPlacePreview = ownCashPlace || eventVenueLabel
  const paymentReadiness = buildPaymentReadiness({
    overrides: draft.paymentChannelOverrides,
    platform: platformChannels?.platform,
    platformStatus: platformChannels?.status,
    venueLabel: eventVenueLabel,
    ownCashPlace,
    bankAlias: bankSummary.alias,
    fallbackBankAlias: env.payments.transferAlias,
    mercadoPagoProfileId: draft.mercadoPagoProfileId,
    mercadoPagoProfile: selectedMpProfile,
    profilesLoading: mpProfilesLoading,
  })

  /** "Configurar" de la tabla: lleva al bloque del medio y deja el foco en su primer campo. */
  function focusChannelConfig(channel) {
    const block = document.getElementById(`event-payment-config-${channel}`)
    if (!block) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    block.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    const field = block.querySelector('select, input:not([type="hidden"]), textarea, button')
    field?.focus({ preventScroll: true })
  }

  // Credenciales cargadas a mano: el formato se valida antes de mandarlas para
  // que un token pegado en el campo de la public key (o con espacios) no
  // termine en un perfil que después rechaza cada cobro.
  const mpPublicKey = mpDraft.publicKey.trim()
  const mpAccessToken = mpDraft.accessToken.trim()
  const mpPublicKeyError =
    mpPublicKey && !MP_CREDENTIAL_PATTERN.test(mpPublicKey)
      ? t('admin.eventEditor.mercadoPagoPublicKeyInvalid')
      : ''
  const mpAccessTokenError =
    mpAccessToken && !MP_CREDENTIAL_PATTERN.test(mpAccessToken)
      ? t('admin.eventEditor.mercadoPagoAccessTokenInvalid')
      : ''
  const mpModeMismatch =
    Boolean(mpPublicKey && mpAccessToken && !mpPublicKeyError && !mpAccessTokenError) &&
    mpPublicKey.startsWith('TEST-') !== mpAccessToken.startsWith('TEST-')
  const mpCredentialsReady =
    Boolean(mpPublicKey && mpAccessToken) &&
    !mpPublicKeyError &&
    !mpAccessTokenError &&
    !mpModeMismatch

  return (
    <section
      ref={activePanelRef}
      id="event-section-sales"
      className="admin-event-form__section admin-event-form__section--sales"
      role="tabpanel"
      aria-label={t('admin.eventEditor.navSales')}
      tabIndex={-1}
    >
      <header
        className={`admin-event-form__section-head admin-event-form__section-head--sales${essentials ? ' admin-event-form__section-head--essentials' : ''}`}
      >
        {essentials ? null : <h4>{t('admin.eventEditor.sectionSales')}</h4>}
        {essentials ? null : (
          <div
            className="admin-event-form__sales-nav"
            role="tablist"
            aria-label={t('admin.eventEditor.salesChapterNavAria')}
          >
            {[
              {
                id: 'cupo',
                label: t('admin.eventEditor.salesChapterCapacity'),
                meta: t('admin.eventEditor.salesChapterCapacityMeta', {
                  count: slotsTotal,
                }),
                panelId: 'event-section-sales-cupo',
              },
              {
                id: 'prices',
                label: t('admin.eventEditor.salesChapterPrices'),
                meta: money(draft.pricing?.registration ?? 0, locale),
                panelId: 'event-section-sales-prices',
              },
              {
                id: 'tickets',
                label: t('admin.eventEditor.salesChapterTickets'),
                meta: ticketSalesEnabled
                  ? t('admin.eventEditor.salesChapterTicketsMeta', {
                      count: ticketTypeCount,
                    })
                  : t('admin.eventEditor.salesChapterTicketsOff'),
                panelId: 'event-section-tickets',
              },
              {
                id: 'payment',
                label: t('admin.eventEditor.salesChapterPayment'),
                meta: t('admin.eventEditor.salesChapterPaymentMeta', {
                  count: ticketChannelCount,
                }),
                panelId: 'event-section-sales-payment',
              },
            ]
              .filter((chapter) => chapter.id !== 'tickets' || showTicketsChapter)
              .map((chapter) => {
                const selected = salesChapter === chapter.id
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    role="tab"
                    id={`event-sales-chapter-${chapter.id}`}
                    className={`admin-event-form__sales-nav-item${selected ? ' is-active' : ''}${salesChaptersWithErrors.has(chapter.id) ? ' has-error' : ''}`}
                    aria-selected={selected}
                    aria-controls={chapter.panelId}
                    onClick={() => handleSalesChapterChange(chapter.id)}
                  >
                    <span className="admin-event-form__sales-nav-label">{chapter.label}</span>
                    <small className="admin-event-form__sales-nav-meta">{chapter.meta}</small>
                  </button>
                )
              })}
          </div>
        )}
        <p>
          {salesChapter === 'tickets'
            ? t('admin.eventEditor.laneSpectatorsLead')
            : salesChapter === 'payment'
              ? t('admin.eventEditor.paymentProfileHint')
              : salesChapter === 'prices'
                ? t('admin.eventEditor.lanePricesLead')
                : t('admin.eventEditor.laneAthletesLead')}
        </p>
      </header>

      {/* El estado real de la venta es de la sección entera, no del
                      capítulo Entradas: el switch que la prende es uno de seis
                      controles y los otros cinco viven en Cobro, en Finanzas o
                      en el entorno. Acá arriba también dice dónde se arregla y
                      lleva al capítulo que corresponde. */}
      {essentials || !draft.id ? null : (
        <AdminTicketSalesStatus draft={draft} onGoToChapter={handleSalesChapterChange} />
      )}

      <div
        id="event-section-sales-cupo"
        className="admin-event-form__lane admin-event-form__lane--athletes admin-event-form__lane--cupo"
        role="tabpanel"
        aria-labelledby="event-sales-chapter-cupo"
        hidden={salesChapter !== 'cupo'}
      >
        {essentials ? null : (
          <header className="admin-event-form__lane-head">
            <h5 className="admin-event-form__lane-title">
              <Users size={13} aria-hidden />
              {t('admin.eventEditor.laneAthletes')}
            </h5>
            <p>{t('admin.eventEditor.laneAthletesLead')}</p>
          </header>
        )}

        <div
          className="admin-event-form__occupancy"
          role="status"
          aria-label={t('admin.eventEditor.occupancyAria', {
            registered: registeredCount,
            total: slotsTotal,
            percent: fillPercent,
          })}
        >
          <div className="admin-event-form__occupancy-copy">
            <span className="admin-event-form__occupancy-value">
              {t('admin.eventEditor.occupancyPulse', {
                registered: registeredCount,
                total: slotsTotal,
              })}
            </span>
            <span className="admin-event-form__occupancy-sep" aria-hidden="true">
              ·
            </span>
            <span className="admin-event-form__occupancy-pct">
              {t('admin.eventEditor.occupancyPercent', { percent: fillPercent })}
            </span>
            <span className="admin-event-form__occupancy-hint">
              {t('admin.eventEditor.slotsRemaining', { count: slotsRemaining })}
            </span>
          </div>
        </div>

        <div className="admin-event-form__cupo">
          <FormField
            htmlFor="event-slots"
            label={t('admin.eventEditor.totalSlots')}
            error={err('slots')}
          >
            <input
              id="event-slots"
              name="slots"
              data-field="slots"
              min={1}
              required
              type="number"
              value={draft.slots}
              aria-invalid={Boolean(err('slots'))}
              onChange={(event) => patchDraft({ ...draft, slots: event.target.value })}
              disabled={!canEdit}
            />
          </FormField>

          <CapacityPublicBreakdown
            canEdit={canEdit}
            preview={publicCapacityPreview}
            progressChecked={draft.capacityProgressPublic !== false}
            progressId="event-capacity-progress-public"
            t={t}
            totalChecked={draft.capacityTotalPublic !== false}
            totalId="event-capacity-total-public"
            onProgressChange={(value) =>
              patchDraft({
                ...draft,
                capacityProgressPublic: value,
              })
            }
            onTotalChange={(value) =>
              patchDraft({
                ...draft,
                capacityTotalPublic: value,
              })
            }
          />
        </div>

        <div className="admin-event-form__grid">
          <FormField
            htmlFor="event-reg-opens"
            label={t('admin.eventEditor.supabase.registrationOpensAt')}
            error={err('registrationOpensAt')}
          >
            <DateTimeLocalInput
              id="event-reg-opens"
              name="registrationOpensAt"
              data-field="registrationOpensAt"
              value={draft.registrationOpensAt ?? ''}
              aria-invalid={Boolean(err('registrationOpensAt'))}
              onChange={(event) =>
                patchDraft({ ...draft, registrationOpensAt: event.target.value })
              }
              disabled={!canEdit}
            />
          </FormField>

          <FormField
            htmlFor="event-reg-closes"
            label={t('admin.eventEditor.supabase.registrationClosesAt')}
            error={err('registrationClosesAt')}
          >
            <DateTimeLocalInput
              id="event-reg-closes"
              name="registrationClosesAt"
              data-field="registrationClosesAt"
              value={draft.registrationClosesAt ?? ''}
              aria-invalid={Boolean(err('registrationClosesAt'))}
              onChange={(event) =>
                patchDraft({ ...draft, registrationClosesAt: event.target.value })
              }
              disabled={!canEdit}
            />
          </FormField>
        </div>
      </div>

      <div
        id="event-section-sales-prices"
        className="admin-event-form__lane admin-event-form__lane--prices"
        role="tabpanel"
        aria-labelledby="event-sales-chapter-prices"
        hidden={salesChapter !== 'prices'}
      >
        {essentials ? null : (
          <header className="admin-event-form__lane-head">
            <h5 className="admin-event-form__lane-title">
              <Banknote size={13} aria-hidden />
              {t('admin.eventEditor.salesChapterPrices')}
            </h5>
            <p>{t('admin.eventEditor.lanePricesLead')}</p>
          </header>
        )}

        <div className="admin-event-form__rate-cards">
          <label
            className={`admin-event-form__rate-card admin-event-form__rate-card--featured${err('pricing.registration') ? ' is-invalid' : ''}`}
          >
            <span className="admin-event-form__rate-card-label">
              {t('admin.eventEditor.priceRegistration')}
            </span>
            <span className="admin-event-form__rate-card-input">
              <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
              <input
                name="pricing.registration"
                data-field="pricing.registration"
                min={1}
                required
                type="number"
                value={draft.pricing?.registration ?? DEFAULT_EVENT_PRICING.registration}
                aria-invalid={Boolean(err('pricing.registration'))}
                onChange={(event) =>
                  patchDraft(updatePricingField(draft, 'registration', event.target.value))
                }
                disabled={!canEdit}
              />
            </span>
            {err('pricing.registration') ? (
              <span className="admin-event-form__error" role="alert">
                {err('pricing.registration')}
              </span>
            ) : null}
          </label>
          <label
            className={`admin-event-form__rate-card${err('pricing.registrationManual') ? ' is-invalid' : ''}`}
          >
            <span className="admin-event-form__rate-card-label">
              {t('admin.eventEditor.priceRegistrationManual')}
            </span>
            <span className="admin-event-form__rate-card-input">
              <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
              <input
                name="pricing.registrationManual"
                data-field="pricing.registrationManual"
                min={1}
                type="number"
                placeholder={t('admin.eventEditor.priceRegistrationManualPlaceholder')}
                value={draft.pricing?.registrationManual ?? ''}
                aria-invalid={Boolean(err('pricing.registrationManual'))}
                onChange={(event) =>
                  patchDraft(updatePricingField(draft, 'registrationManual', event.target.value))
                }
                disabled={!canEdit}
              />
            </span>
            {err('pricing.registrationManual') ? (
              <span className="admin-event-form__error" role="alert">
                {err('pricing.registrationManual')}
              </span>
            ) : null}
          </label>
          <p className="admin-event-form__price-summary" aria-live="polite">
            {(() => {
              const online = Number(draft.pricing?.registration) || 0
              const manual = Number(draft.pricing?.registrationManual) || 0
              if (!manual || manual === online) {
                return t('admin.eventEditor.priceSummarySame', {
                  price: money(online, locale),
                })
              }
              const diff = Math.round(((manual - online) / online) * 100)
              return t('admin.eventEditor.priceSummaryDiff', {
                online: money(online, locale),
                manual: money(manual, locale),
                diff: `${diff > 0 ? '+' : ''}${diff}%`,
              })
            })()}
          </p>
          <p className="admin-event-form__pricing-note">
            {t('admin.eventEditor.pricingCatalogHint')}
          </p>
        </div>
        {draft.id &&
        draft.slug &&
        (onSetEventRegistrationPrice || sourceEvent?.priceEffectiveAt) ? (
          <AdminEventPriceSchedule
            canEdit={canEdit}
            currentManualPrice={draft.pricing?.registrationManual ?? null}
            currentPrice={draft.pricing?.registration ?? DEFAULT_EVENT_PRICING.registration}
            onClearSchedule={
              onClearEventPriceSchedule ? () => onClearEventPriceSchedule(draft.slug) : null
            }
            onSetSchedule={
              onSetEventRegistrationPrice
                ? (payload) => onSetEventRegistrationPrice(draft.slug, payload)
                : null
            }
            priceDirty={
              Number(draft.pricing?.registration) !== Number(sourceEvent?.price) ||
              Number(draft.pricing?.registrationManual ?? 0) !==
                Number(sourceEvent?.manualPrice ?? 0)
            }
            priceEffectiveAt={sourceEvent?.priceEffectiveAt ?? null}
            scheduledManualPrice={sourceEvent?.scheduledManualPrice ?? null}
            scheduledPrice={sourceEvent?.scheduledPrice ?? null}
          />
        ) : null}
      </div>

      <div
        id="event-section-sales-payment"
        className="admin-event-form__lane admin-event-form__lane--payment"
        role="tabpanel"
        aria-labelledby="event-sales-chapter-payment"
        hidden={salesChapter !== 'payment'}
      >
        <div className="admin-event-form__payment-profile">
          {essentials ? null : (
            <header className="admin-event-form__lane-head">
              <h5 className="admin-event-form__lane-title">
                <Banknote size={13} aria-hidden />
                {t('admin.eventEditor.paymentProfileTitle')}
              </h5>
              <p>{t('admin.eventEditor.paymentProfileHint')}</p>
            </header>
          )}

          {/* Soft-launch: el meet se anuncia sin exigir medios de inscripción.
              No es inscripción gratis (price = 0); es “todavía no cobramos”. */}
          <label className="admin-event-form__toggle admin-event-form__sales-intent">
            <input
              className="admin-event-form__toggle-input"
              type="checkbox"
              checked={draft.salesIntent === 'announce'}
              disabled={!canEdit}
              onChange={(changeEvent) =>
                patchDraft({
                  ...draft,
                  salesIntent: changeEvent.target.checked ? 'announce' : 'charge',
                })
              }
            />
            <span className="admin-event-form__toggle-ui" aria-hidden />
            <span className="admin-event-form__toggle-copy">
              <strong>{t('admin.eventEditor.salesIntentAnnounceTitle')}</strong>
              <small>{t('admin.eventEditor.salesIntentAnnounceHint')}</small>
            </span>
          </label>

          {/* La plataforma es el valor por defecto y cada celda del evento
              puede cerrar o abrir. Sin override se muestra lo que hereda, y
              tocar una celda que difiere de Finanzas crea el override solo. */}
          <EventPaymentChannelMatrix
            value={draft.paymentChannelOverrides}
            onChange={(next) => patchDraft({ ...draft, paymentChannelOverrides: next })}
            platform={platformChannels.platform}
            platformStatus={platformChannels.status}
            canEdit={canEdit}
            restrictOpen={eventScoped}
            ticketError={err('paymentChannelOverrides.ticket')}
            readiness={paymentReadiness}
            onConfigure={focusChannelConfig}
          />

          {/* Sin override el evento sigue lo que Finanzas abra o cierre
              mañana. Con override queda fijo en lo que difiere, así que
              conviene poder volver. */}
          {canEdit && !eventScoped && draft.paymentChannelOverrides != null ? (
            <button
              className="button button--ghost admin-event-form__channel-reset"
              type="button"
              onClick={() => patchDraft({ ...draft, paymentChannelOverrides: null })}
            >
              <RotateCcw size={14} aria-hidden />
              {t('admin.eventEditor.paymentChannelReset')}
            </button>
          ) : null}

          {channelOpenHere('bank_transfer') ? null : (
            <p className="admin-event-form__field-hint" data-channel="bank_transfer-closed">
              {t('admin.eventEditor.bankTransferClosedHint')}
            </p>
          )}
          {channelOpenHere('cash_pitbull') ? null : (
            <p className="admin-event-form__field-hint" data-channel="cash_pitbull-closed">
              {t('admin.eventEditor.cashPaymentClosedHint')}
            </p>
          )}

          {channelOpenHere('mercado_pago') ? (
            <div className="admin-event-form__bank-transfer" id="event-payment-config-mercado_pago">
              <header className="admin-event-form__lane-head">
                <h5 className="admin-event-form__lane-title">
                  {t('admin.eventEditor.mercadoPagoProfileTitle')}
                </h5>
                <p>{t('admin.eventEditor.mercadoPagoProfileHint')}</p>
              </header>

              {!mpSecretsKeyConfigured ? (
                <p className="admin-event-form__notice" role="status">
                  {t('admin.eventEditor.mercadoPagoSecretsKeyMissing')}
                </p>
              ) : null}

              <FormField
                htmlFor="event-mp-profile"
                label={t('admin.eventEditor.mercadoPagoProfile')}
                error={err('mercadoPagoProfileId')}
                wide
              >
                <select
                  id="event-mp-profile"
                  name="mercadoPagoProfileId"
                  value={draft.mercadoPagoProfileId ?? ''}
                  aria-invalid={Boolean(err('mercadoPagoProfileId'))}
                  onChange={(changeEvent) => applyMpProfile(changeEvent.target.value || null)}
                  disabled={!canEdit || mpProfilesLoading}
                >
                  <option value="">{t('admin.eventEditor.mercadoPagoProfileNone')}</option>
                  {/* Una cuenta archivada que el evento todavía tiene elegida
                      no viene en la lista: sin esta opción el select la
                      mostraría como "cuenta general" y guardar la pisaría. */}
                  {draft.mercadoPagoProfileId && !selectedMpProfile && !mpProfilesLoading ? (
                    <option value={draft.mercadoPagoProfileId}>
                      {t('admin.paymentAccounts.editorArchivedOption')}
                    </option>
                  ) : null}
                  {mpProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {paymentAccountOptionLabel(profile)}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* En qué cuenta entra la plata y si puede seguir cobrando. Una
                  cuenta vinculada que vence o que MP dejó de autorizar se
                  reconecta desde acá, sin salir del editor. */}
              {selectedMpProfile ? (
                <MercadoPagoAccountStatus
                  t={t}
                  locale={locale}
                  profile={selectedMpProfile}
                  action={
                    canEdit &&
                    mpOAuthAvailable &&
                    ['expiring', 'needs_reconnect'].includes(
                      mercadoPagoAccountStatus(selectedMpProfile),
                    ) ? (
                      <MercadoPagoConnectControl
                        t={t}
                        profileId={selectedMpProfile.id}
                        label={t('admin.paymentAccounts.reconnect')}
                        buttonClassName="payment-account-connect__link"
                        onConnected={onMpProfileConnected}
                      />
                    ) : null
                  }
                />
              ) : (
                <p className="admin-event-form__provider-status">
                  {t('admin.paymentAccounts.editorGlobalAccount')}
                </p>
              )}

              {/* El alta de la cuenta vive acá también en la consola del evento:
                  antes solo existía en el editor modal y desde la página del
                  evento no había forma de vincular un Mercado Pago nuevo. */}
              {canEdit && (mpOAuthAvailable || (mpSecretsKeyConfigured && !eventScoped)) ? (
                <div className="admin-event-form__mp-actions">
                  {mpOAuthAvailable ? (
                    <MercadoPagoConnectControl
                      t={t}
                      label={t('admin.paymentAccounts.connect')}
                      onConnected={onMpProfileConnected}
                    />
                  ) : null}
                  {/* Cargar las credenciales a mano queda como alternativa
                      (o como único camino si la app de MP no está configurada
                      en el servidor). */}
                  {mpSecretsKeyConfigured && !eventScoped ? (
                    <button
                      className={
                        mpOAuthAvailable ? 'payment-account-connect__link' : 'btn--small btn--ghost'
                      }
                      type="button"
                      aria-expanded={mpCreateOpen}
                      onClick={() => setMpCreateOpen((open) => !open)}
                    >
                      {mpOAuthAvailable
                        ? t('admin.paymentAccounts.manualToggle')
                        : t('admin.eventEditor.mercadoPagoProfileCreate')}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {mpCreateOpen && !eventScoped ? (
                <fieldset
                  className="admin-event-form__mp-manual"
                  aria-describedby="event-mp-manual-hint"
                >
                  <legend>{t('admin.eventEditor.mercadoPagoManualTitle')}</legend>
                  <p className="admin-event-form__mp-manual-hint" id="event-mp-manual-hint">
                    {t('admin.eventEditor.mercadoPagoManualHint')}
                  </p>
                  <div className="admin-event-form__grid">
                    <FormField
                      htmlFor="event-mp-name"
                      label={t('admin.eventEditor.mercadoPagoProfileName')}
                      wide
                    >
                      <input
                        id="event-mp-name"
                        value={mpDraft.name}
                        maxLength={120}
                        placeholder={t('admin.eventEditor.mercadoPagoProfileNamePlaceholder', {
                          event: draft.title || draft.slug || 'evento',
                        })}
                        onChange={(changeEvent) =>
                          setMpDraft({ ...mpDraft, name: changeEvent.target.value })
                        }
                      />
                    </FormField>
                    <FormField
                      htmlFor="event-mp-public-key"
                      label={t('admin.eventEditor.mercadoPagoPublicKey')}
                      error={mpPublicKeyError}
                    >
                      <input
                        id="event-mp-public-key"
                        value={mpDraft.publicKey}
                        aria-invalid={Boolean(mpPublicKeyError)}
                        placeholder="APP_USR-…"
                        spellCheck={false}
                        onChange={(changeEvent) =>
                          setMpDraft({ ...mpDraft, publicKey: changeEvent.target.value })
                        }
                        autoComplete="off"
                      />
                    </FormField>
                    <FormField
                      htmlFor="event-mp-access-token"
                      label={t('admin.eventEditor.mercadoPagoAccessToken')}
                      error={mpAccessTokenError}
                    >
                      <input
                        id="event-mp-access-token"
                        type="password"
                        value={mpDraft.accessToken}
                        aria-invalid={Boolean(mpAccessTokenError)}
                        placeholder="APP_USR-…"
                        spellCheck={false}
                        onChange={(changeEvent) =>
                          setMpDraft({
                            ...mpDraft,
                            accessToken: changeEvent.target.value,
                          })
                        }
                        autoComplete="new-password"
                      />
                    </FormField>
                    <FormField
                      htmlFor="event-mp-webhook-secret"
                      label={t('admin.eventEditor.mercadoPagoWebhookSecret')}
                    >
                      <input
                        id="event-mp-webhook-secret"
                        type="password"
                        value={mpDraft.webhookSecret}
                        spellCheck={false}
                        onChange={(changeEvent) =>
                          setMpDraft({
                            ...mpDraft,
                            webhookSecret: changeEvent.target.value,
                          })
                        }
                        autoComplete="new-password"
                      />
                    </FormField>
                    <FormField
                      htmlFor="event-mp-collector-id"
                      label={t('admin.eventEditor.mercadoPagoCollectorId')}
                    >
                      <input
                        id="event-mp-collector-id"
                        inputMode="numeric"
                        value={mpDraft.collectorId}
                        spellCheck={false}
                        onChange={(changeEvent) =>
                          setMpDraft({
                            ...mpDraft,
                            collectorId: changeEvent.target.value.replace(/\D+/g, ''),
                          })
                        }
                        autoComplete="off"
                      />
                    </FormField>
                  </div>
                  {mpModeMismatch ? (
                    <p className="admin-event-form__notice" role="status">
                      {t('admin.eventEditor.mercadoPagoModeMismatch')}
                    </p>
                  ) : null}
                  {mpCreateError ? (
                    <p className="admin-event-form__alert" role="alert">
                      {mpCreateError}
                    </p>
                  ) : null}
                  <div className="admin-event-form__mp-manual-actions">
                    <button
                      className="btn btn--outline"
                      type="button"
                      onClick={() => setMpCreateOpen(false)}
                    >
                      {t('admin.paymentAccounts.connectCancel')}
                    </button>
                    <button
                      className="btn btn--gold"
                      type="button"
                      disabled={mpCreating || !mpCredentialsReady}
                      aria-busy={mpCreating || undefined}
                      onClick={() => void handleCreateMpProfile()}
                    >
                      {mpCreating
                        ? t('admin.eventEditor.mercadoPagoProfileCreating')
                        : t('admin.eventEditor.mercadoPagoProfileCreate')}
                    </button>
                  </div>
                </fieldset>
              ) : null}
            </div>
          ) : null}

          {channelOpenHere('bank_transfer') ? (
            <div
              className="admin-event-form__bank-transfer"
              id="event-payment-config-bank_transfer"
            >
              <header className="admin-event-form__lane-head">
                <h5 className="admin-event-form__lane-title">
                  {essentials
                    ? t('admin.eventEditor.paymentChannelBankTransfer')
                    : t('admin.eventEditor.bankTransferTitle')}
                </h5>
                {essentials ? null : <p>{t('admin.eventEditor.bankTransferHint')}</p>}
              </header>

              <FormField
                htmlFor="event-bank-profile"
                label={t('admin.eventEditor.bankTransferProfile')}
                error={err('bankTransferProfileId')}
                wide
              >
                <select
                  id="event-bank-profile"
                  name="bankTransferProfileId"
                  value={draft.bankTransferProfileId ?? ''}
                  aria-invalid={Boolean(err('bankTransferProfileId'))}
                  onChange={(changeEvent) => applyBankProfile(changeEvent.target.value || null)}
                  disabled={!canEdit || bankProfilesLoading}
                >
                  {!eventScoped || !draft.bankTransferProfileId ? (
                    <option value="">{t('admin.eventEditor.bankTransferProfileNone')}</option>
                  ) : null}
                  {bankProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                      {profile.config?.alias ? ` · ${profile.config.alias}` : ''}
                    </option>
                  ))}
                </select>
                <small className="admin-event-form__field-hint">
                  {t('admin.eventEditor.bankTransferProfileHint')}
                </small>
              </FormField>

              {bankLinked ? (
                <div className="admin-event-form__account-summary" data-field="bankTransfer.linked">
                  <dl>
                    <div>
                      <dt>{t('admin.eventEditor.bankTransferAlias')}</dt>
                      <dd>{bankSummary.alias || '—'}</dd>
                    </div>
                    <div>
                      <dt>{t('admin.eventEditor.bankTransferCbu')}</dt>
                      <dd>{bankSummary.cbu || '—'}</dd>
                    </div>
                    <div>
                      <dt>{t('admin.eventEditor.bankTransferHolder')}</dt>
                      <dd>{bankSummary.holder || '—'}</dd>
                    </div>
                  </dl>
                  <p className="admin-event-form__field-hint">
                    {t('admin.eventEditor.bankTransferLinkedHint', {
                      name: selectedBankProfile?.name ?? bankSummary.alias,
                    })}
                  </p>
                  {canEdit && !eventScoped ? (
                    <button
                      className="button button--ghost admin-event-form__channel-reset"
                      type="button"
                      onClick={() => applyBankProfile(null)}
                    >
                      {t('admin.eventEditor.bankTransferUseOther')}
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  {!eventScoped &&
                  !draft.bankTransferProfileId &&
                  (draft.bankTransfer?.alias ||
                    draft.bankTransfer?.cbu ||
                    draft.bankTransfer?.holder) ? (
                    <p className="admin-event-form__pricing-note" role="status">
                      {t('admin.eventEditor.bankTransferSaveCreatesProfile')}
                    </p>
                  ) : null}

                  <div className="admin-event-form__grid">
                    <FormField
                      htmlFor="event-bank-alias"
                      label={t('admin.eventEditor.bankTransferAlias')}
                    >
                      <input
                        id="event-bank-alias"
                        name="bankTransfer.alias"
                        type="text"
                        maxLength={120}
                        value={draft.bankTransfer?.alias ?? ''}
                        onChange={(changeEvent) =>
                          patchDraft({
                            ...draft,
                            bankTransferProfileId: null,
                            bankTransfer: {
                              ...(draft.bankTransfer ?? {}),
                              alias: changeEvent.target.value,
                            },
                          })
                        }
                        disabled={!canEdit || eventScoped}
                        placeholder={t('admin.eventEditor.bankTransferAliasPlaceholder')}
                      />
                    </FormField>
                    <FormField
                      htmlFor="event-bank-cbu"
                      label={t('admin.eventEditor.bankTransferCbu')}
                    >
                      <input
                        id="event-bank-cbu"
                        name="bankTransfer.cbu"
                        type="text"
                        maxLength={30}
                        value={draft.bankTransfer?.cbu ?? ''}
                        onChange={(changeEvent) =>
                          patchDraft({
                            ...draft,
                            bankTransferProfileId: null,
                            bankTransfer: {
                              ...(draft.bankTransfer ?? {}),
                              cbu: changeEvent.target.value,
                            },
                          })
                        }
                        disabled={!canEdit || eventScoped}
                      />
                    </FormField>
                    <FormField
                      htmlFor="event-bank-holder"
                      label={t('admin.eventEditor.bankTransferHolder')}
                      wide
                    >
                      <input
                        id="event-bank-holder"
                        name="bankTransfer.holder"
                        type="text"
                        maxLength={160}
                        value={draft.bankTransfer?.holder ?? ''}
                        onChange={(changeEvent) =>
                          patchDraft({
                            ...draft,
                            bankTransferProfileId: null,
                            bankTransfer: {
                              ...(draft.bankTransfer ?? {}),
                              holder: changeEvent.target.value,
                            },
                          })
                        }
                        disabled={!canEdit || eventScoped}
                      />
                    </FormField>
                  </div>
                </>
              )}

              <div
                className="admin-event-form__reference-note"
                role="note"
                data-field="bankTransfer.reference"
              >
                <strong>{t('admin.eventEditor.bankTransferReferenceLabel')}</strong>
                <p>{t('admin.eventEditor.bankTransferReferenceHint')}</p>
                <code className="admin-event-form__reference-example">
                  {t('admin.eventEditor.bankTransferReferenceExample')}
                </code>
              </div>
            </div>
          ) : null}

          {/* Efectivo en el lugar: nada que vincular, solo dónde se paga. Vacío
              cae en la sede del evento, que es lo que ve el comprador. */}
          {channelOpenHere('cash_pitbull') ? (
            <div
              className="admin-event-form__bank-transfer"
              data-channel="cash_pitbull"
              id="event-payment-config-cash_pitbull"
            >
              <header className="admin-event-form__lane-head">
                <h5 className="admin-event-form__lane-title">
                  {t('admin.eventEditor.cashPaymentTitle')}
                </h5>
                {essentials ? null : <p>{t('admin.eventEditor.cashPaymentHint')}</p>}
              </header>

              <div className="admin-event-form__grid">
                <FormField
                  htmlFor="event-cash-place"
                  label={t('admin.eventEditor.cashPaymentPlace')}
                  error={err('cashPayment.place')}
                  wide
                >
                  <input
                    id="event-cash-place"
                    name="cashPayment.place"
                    type="text"
                    maxLength={160}
                    value={draft.cashPayment?.place ?? ''}
                    aria-invalid={Boolean(err('cashPayment.place'))}
                    aria-describedby="event-cash-place-hint"
                    onChange={(changeEvent) =>
                      patchDraft({
                        ...draft,
                        cashPayment: {
                          ...(draft.cashPayment ?? {}),
                          place: changeEvent.target.value,
                        },
                      })
                    }
                    disabled={!canEdit}
                    placeholder={eventVenueLabel || undefined}
                  />
                  <small className="admin-event-form__field-hint" id="event-cash-place-hint">
                    {eventVenueLabel
                      ? t('admin.eventEditor.cashPaymentPlaceHint', { venue: eventVenueLabel })
                      : t('admin.eventEditor.cashPaymentPlaceHintNoVenue')}
                  </small>
                </FormField>
                <FormField
                  htmlFor="event-cash-notes"
                  label={t('admin.eventEditor.cashPaymentNotes')}
                  error={err('cashPayment.notes')}
                  wide
                >
                  <textarea
                    id="event-cash-notes"
                    name="cashPayment.notes"
                    rows={2}
                    maxLength={400}
                    value={draft.cashPayment?.notes ?? ''}
                    aria-invalid={Boolean(err('cashPayment.notes'))}
                    onChange={(changeEvent) =>
                      patchDraft({
                        ...draft,
                        cashPayment: {
                          ...(draft.cashPayment ?? {}),
                          notes: changeEvent.target.value,
                        },
                      })
                    }
                    disabled={!canEdit}
                    placeholder={t('admin.eventEditor.cashPaymentNotesPlaceholder')}
                  />
                </FormField>
              </div>

              {cashPlacePreview ? (
                <div className="admin-event-form__reference-note" role="note">
                  <strong>{t('admin.eventEditor.cashPaymentPreviewLabel')}</strong>
                  <p>
                    {ownCashPlace
                      ? t('admin.eventEditor.cashPaymentPreviewOwn')
                      : t('admin.eventEditor.cashPaymentPreviewVenue')}
                  </p>
                  <p>{cashPlacePreview}</p>
                  {String(draft.cashPayment?.notes ?? '').trim() ? (
                    <p>{String(draft.cashPayment.notes).trim()}</p>
                  ) : null}
                </div>
              ) : (
                <p className="admin-event-form__notice" role="status">
                  {t('admin.eventEditor.cashPaymentPreviewMissing')}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {showTicketsChapter ? (
        <div
          id="event-section-tickets"
          className={`admin-event-form__lane admin-event-form__lane--tickets${essentials ? ' admin-event-form__lane--tickets-essentials' : ''}`}
          role="tabpanel"
          aria-labelledby="event-sales-chapter-tickets"
          hidden={salesChapter !== 'tickets'}
        >
          {essentials ? null : (
            <header className="admin-event-form__lane-head">
              <h5 className="admin-event-form__lane-title">
                <Ticket size={13} aria-hidden />
                {t('admin.eventEditor.laneSpectators')}
              </h5>
              <p>{t('admin.eventEditor.laneSpectatorsLead')}</p>
            </header>
          )}

          <label className="admin-event-form__toggle">
            <input
              checked={ticketSalesEnabled}
              className="admin-event-form__toggle-input"
              type="checkbox"
              onChange={(event) =>
                patchDraft(updatePricingField(draft, 'ticketsEnabled', event.target.checked))
              }
              disabled={!canEdit}
            />
            <span className="admin-event-form__toggle-ui" aria-hidden />
            <span className="admin-event-form__toggle-copy">
              <strong>
                <Ticket size={13} aria-hidden />
                {ticketSalesEnabled
                  ? t('admin.eventEditor.ticketsOnSale')
                  : t('admin.eventEditor.ticketsSell')}
              </strong>
              <small>
                {ticketSalesEnabled
                  ? t('admin.eventEditor.ticketsEnabledHint')
                  : t('admin.eventEditor.ticketsDisabledNote')}
              </small>
            </span>
          </label>

          {/* El switch de arriba es uno de seis controles. Esta tira
                        dice cuál está cortando de verdad y dónde se toca: sin
                        ella, prenderlo y que no pase nada era lo habitual. */}
          <AdminTicketSalesStatus draft={draft} />

          {/* Los dos bloqueos de "prendiste la venta pero falta algo"
                        llegan como claves de raíz, sin un input al que colgarse:
                        sin estos carteles el Guardar no hacía nada visible. */}
          {err('eventDays') ? (
            <p
              className="admin-event-form__alert"
              role="alert"
              data-field="eventDays"
              tabIndex={-1}
            >
              {err('eventDays')}
            </p>
          ) : null}
          {err('ticketTypes') ? (
            <p
              className="admin-event-form__alert"
              role="alert"
              data-field="ticketTypes"
              tabIndex={-1}
            >
              {err('ticketTypes')}
            </p>
          ) : null}

          {ticketSalesEnabled ? (
            <>
              {/* La ventana de venta queda al mismo nivel que la de
                        inscripción: son las dos palancas de cierre del evento y
                        antes esta vivía dos <details> más adentro. */}
              <div className="admin-event-form__grid">
                <FormField
                  htmlFor="event-ticket-opens"
                  label={t('admin.eventEditor.supabase.ticketSalesOpensAt')}
                  error={err('ticketSalesOpensAt')}
                >
                  <DateTimeLocalInput
                    id="event-ticket-opens"
                    name="ticketSalesOpensAt"
                    data-field="ticketSalesOpensAt"
                    value={draft.ticketSalesOpensAt ?? ''}
                    aria-invalid={Boolean(err('ticketSalesOpensAt'))}
                    onChange={(event) =>
                      patchDraft({ ...draft, ticketSalesOpensAt: event.target.value })
                    }
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  htmlFor="event-ticket-closes"
                  label={t('admin.eventEditor.supabase.ticketSalesClosesAt')}
                  error={err('ticketSalesClosesAt')}
                >
                  <DateTimeLocalInput
                    id="event-ticket-closes"
                    name="ticketSalesClosesAt"
                    data-field="ticketSalesClosesAt"
                    value={draft.ticketSalesClosesAt ?? ''}
                    aria-invalid={Boolean(err('ticketSalesClosesAt'))}
                    onChange={(event) =>
                      patchDraft({ ...draft, ticketSalesClosesAt: event.target.value })
                    }
                    disabled={!canEdit}
                  />
                </FormField>
              </div>

              <div className="admin-event-form__ticket-config">
                <div className="admin-event-form__ticket-config-body">
                  <AdminTicketAddonsEditor
                    addons={draft.pricing?.ticketAddons ?? []}
                    canEdit={canEdit}
                    errors={fieldErrors}
                    onChange={(ticketAddons) =>
                      patchDraft(updatePricingField(draft, 'ticketAddons', ticketAddons))
                    }
                  />

                  <AdminTicketTypesEditor
                    addonsCatalog={draft.pricing?.ticketAddons ?? []}
                    allowEditDays={!accordion}
                    canEdit={canEdit}
                    errors={fieldErrors}
                    eventDays={draft.eventDays ?? []}
                    eventPaymentChannelOverrides={draft.paymentChannelOverrides ?? null}
                    onChangeEventDays={(eventDays) => patchDraft({ ...draft, eventDays })}
                    onChangeTicketTypes={(ticketTypes) => patchDraft({ ...draft, ticketTypes })}
                    onOpenStructure={accordion ? () => onRequestSection?.('structure') : undefined}
                    ticketTypes={draft.ticketTypes ?? []}
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

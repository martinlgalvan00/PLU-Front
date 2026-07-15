export async function processMembershipRenewals(options = {}) {
  const { repository, brevo, templateId, appUrl, offsets, limit } = options
  if (!repository || !brevo?.configured || !templateId) {
    return { processed: 0, sent: 0, failed: 0, skipped: true }
  }

  const notifications = await repository.claimRenewals({ offsets, limit })
  let sent = 0
  let failed = 0

  for (const notification of notifications ?? []) {
    try {
      await brevo.sendTemplate({
        to: notification.recipientEmail,
        templateId,
        params: {
          name: notification.athleteName,
          memberCode: notification.memberCode,
          expirationDate: notification.expirationDate,
          notificationKey: notification.notificationKey,
          renewalUrl: `${appUrl}/mi-cuenta?section=membership`,
        },
      })
      await repository.completeRenewal(notification.id, { sent: true })
      sent += 1
    } catch (error) {
      await repository.completeRenewal(notification.id, {
        sent: false,
        error: error?.message ?? String(error),
      })
      failed += 1
    }
  }

  return { processed: notifications?.length ?? 0, sent, failed, skipped: false }
}

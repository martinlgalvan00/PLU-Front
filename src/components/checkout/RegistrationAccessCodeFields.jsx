import { KeyRound } from 'lucide-react'
import '../../styles/components/registration-access-code.css'

export default function RegistrationAccessCodeFields({
  membershipRequired = false,
  registrationRequired = false,
  membershipCode,
  registrationCode,
  onMembershipCodeChange,
  onRegistrationCodeChange,
  disabled = false,
}) {
  if (!membershipRequired && !registrationRequired) return null

  return (
    <fieldset className="registration-access-code" disabled={disabled}>
      <legend>
        <KeyRound size={16} aria-hidden />
        Acceso por tanda
      </legend>
      <p>Esta apertura es privada. Ingresá el código que te compartió la organización.</p>
      {membershipRequired ? (
        <label>
          Código para afiliación
          <input type="password" autoComplete="one-time-code" value={membershipCode} onChange={(event) => onMembershipCodeChange?.(event.target.value)} placeholder="Código de afiliación" required />
        </label>
      ) : null}
      {registrationRequired ? (
        <label>
          Código para inscripción
          <input type="password" autoComplete="one-time-code" value={registrationCode} onChange={(event) => onRegistrationCodeChange?.(event.target.value)} placeholder="Código del torneo" required />
        </label>
      ) : null}
    </fieldset>
  )
}

import { useState } from 'react'
import { Check, Send } from 'lucide-react'
import { registerLaunchInterest } from '../../services/launchInterestService.js'

export default function LaunchInterestForm({ source, eventSlug }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle, loading, success, error

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    setStatus('loading')
    try {
      await registerLaunchInterest({ email, source, eventSlug })
      setStatus('success')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="shop-interest-form shop-interest-form--success">
        <Check size={18} />
        <span>¡Anotado! Te avisaremos.</span>
      </div>
    )
  }

  return (
    <form className="shop-interest-form" onSubmit={handleSubmit}>
      <input 
        type="email" 
        placeholder="Tu correo electrónico" 
        value={email} 
        onChange={e => setEmail(e.target.value)} 
        required 
        disabled={status === 'loading'}
      />
      <button type="submit" disabled={status === 'loading'} aria-label="Notificarme">
        {status === 'loading' ? '...' : <Send size={16} />}
      </button>
    </form>
  )
}

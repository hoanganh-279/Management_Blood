import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Spinner } from 'react-bootstrap'
import { Navigate, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../auth/AuthContext'
import logoFull from '../assets/logo-full.png'

export default function LoginPage() {
  const { login, loginWithGoogle, user, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const googleBtnRef = useRef(null)
  const googleCallbackRef = useRef(null)

  googleCallbackRef.current = async (response) => {
    if (!response?.credential) {
      setError('Không nhận được thông tin từ Google.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await loginWithGoogle(response.credential)
      navigate('/')
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail) {
        setError(typeof detail === 'string' ? detail : 'Đăng nhập Google thất bại.')
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Không kết nối được API. Kiểm tra backend đang chạy và CORS.')
      } else {
        setError('Đăng nhập Google thất bại.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    let scriptEl = null

    async function setupGoogle() {
      try {
        const { data } = await api.get('/auth/google/config')
        if (cancelled || !data?.enabled || !data.client_id) return

        const render = () => {
          if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return
          window.google.accounts.id.initialize({
            client_id: data.client_id,
            callback: (res) => googleCallbackRef.current?.(res),
            auto_select: false,
            ux_mode: 'popup',
          })
          googleBtnRef.current.innerHTML = ''
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            width: 320,
            locale: 'vi',
          })
          setGoogleReady(true)
        }

        if (window.google?.accounts?.id) {
          render()
          return
        }

        scriptEl = document.createElement('script')
        scriptEl.src = 'https://accounts.google.com/gsi/client'
        scriptEl.async = true
        scriptEl.onload = () => render()
        scriptEl.onerror = () => {
          if (!cancelled) setError('Không tải được Google Sign-In.')
        }
        document.body.appendChild(scriptEl)
      } catch {
        // Google optional — keep password login
      }
    }

    setupGoogle()
    return () => {
      cancelled = true
      if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl)
    }
  }, [])

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail) {
        setError(typeof detail === 'string' ? detail : 'Đăng nhập thất bại.')
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Không kết nối được API. Kiểm tra backend đang chạy và CORS (localhost vs 127.0.0.1).')
      } else {
        setError('Sai thông tin đăng nhập. Vui lòng kiểm tra lại email hoặc mật khẩu.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-split">
      <div className="login-hero">
        <div>
          <div className="small mb-3">HỆ THỐNG DSS NỘI BỘ</div>
          <h1 className="display-5 fw-bold">Management Blood</h1>
          <p className="lead">Điều phối máu bệnh viện ↔ ngân hàng máu</p>
          <p className="opacity-75">Hệ thống nội bộ — DSS hỗ trợ quyết định</p>
        </div>
        <div className="small opacity-75">Mạng lưới cung ứng máu liên cơ sở</div>
      </div>
      <div className="login-form-wrap">
        <div className="login-card">
          <img src={logoFull} alt="Management Blood" className="login-logo mb-4" />
          <div className="text-danger small mb-2">• Hệ thống nội bộ</div>
          <h2 className="h3 mb-1">Đăng nhập</h2>
          <p className="text-secondary mb-4">
            Dành cho nhân viên bệnh viện, ngân hàng máu và điều phối.
          </p>
          {error && (
            <Alert variant="danger" dismissible onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          <Form onSubmit={onSubmit}>
            <Form.Group className="mb-3" controlId="login-email">
              <Form.Label>Email *</Form.Label>
              <Form.Control
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="login-password">Mật khẩu *</Form.Label>
              <InputPassword value={password} onChange={setPassword} show={showPw} setShow={setShowPw} disabled={submitting} />
            </Form.Group>
            <p className="text-secondary small mb-3">
              Quên mật khẩu? Liên hệ quản trị viên hệ thống để được cấp lại.
            </p>
            <Button type="submit" className="w-100 btn-emergency" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : 'Đăng nhập'}
            </Button>
          </Form>

          <div className="login-divider my-3">
            <span>hoặc</span>
          </div>
          <div className="d-flex justify-content-center">
            <div
              ref={googleBtnRef}
              className={`google-btn-host${submitting ? ' opacity-50 pe-none' : ''}`}
              aria-label="Đăng nhập bằng Google"
            />
          </div>
          {!googleReady && (
            <p className="text-secondary small text-center mt-2 mb-0">Đang tải đăng nhập Google…</p>
          )}

          <p className="disclaimer mt-3 mb-0">Kết quả hệ thống chỉ hỗ trợ quyết định vận hành.</p>
        </div>
      </div>
    </div>
  )
}

function EyeIcon({ crossed }) {
  if (crossed) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function InputPassword({ value, onChange, show, setShow, disabled }) {
  return (
    <div className="input-group">
      <input
        id="login-password"
        className="form-control"
        autoComplete="current-password"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        disabled={disabled}
      />
      <button
        type="button"
        className="btn btn-outline-secondary d-inline-flex align-items-center justify-content-center px-3"
        onClick={() => setShow(!show)}
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        title={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        <EyeIcon crossed={!show} />
      </button>
    </div>
  )
}
